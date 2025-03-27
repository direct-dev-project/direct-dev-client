import type {
  Deferred,
  SupportedProviderId,
  DirectRPCErrorResponse,
  DirectRPCRequest,
  DirectRPCSuccessResponse,
  LogLevel,
  RPCRequestHash,
  DirectRPCHead,
} from "@direct.dev/shared";
import {
  Logger,
  PushableAsyncGenerator,
  chunkArray,
  deriveProviderFromNodeUrl,
  deriveProviderFromRequest,
  makeDeferred,
  weightedPick,
} from "@direct.dev/shared";
import { wire, WireDecodeStream, WireEncodeStream } from "@direct.dev/wire";

import type { BatchConfig, DirectRPCBatch } from "./batch.core.js";
import { isRpcErrorResponse, isRpcRequest, isRpcSuccessResponse } from "./guards.js";
import { createBatch } from "./util.create-batch.js";
import { isSupportedRequest } from "./util.is-supported-request.js";
import { normalizeContextFromUrl } from "./util.normalize-url.js";

/**
 * configures the maximum number of requests to dispatch within a single
 * request batch.
 */
const BATCH_MAX_SIZE = 10;

/**
 * specifies the base back-off duration in case the Direct.dev infrastructure
 * goes down (this will be exponentially increased in case of repeated failures)
 */
const BASE_BACKOFF_DURATION_MS = 5_000;

/**
 * Client configurations, mapping the client to your Direct.dev project and the
 * desired network.
 *
 * These values should be copy+pasted from the project dashboard as found on
 * your Direct.dev profile.
 */
export type DirectRPCClientConfig = {
  projectId: string;
  networkId: string;

  /**
   * When copy+pasting integration codes from Direct.dev, a signature is
   * provided which allows your project to cold start faster - this remove
   * latency on initial requests after periods of inactivity.
   */
  signature?: string;

  /**
   * Override the baseUrl used when connecting to Direct infrastructure, useful
   * especially when running a local testing environment.
   *
   * @default "https://rpc.direct.dev"
   */
  baseUrl?: string;

  /**
   * Specifies the verbosity of logging from the DirectClient
   *
   * @default "info"
   */
  logLevel?: LogLevel;

  /**
   * Specifies the duration during which requests are batched, causing a slight
   * delay between initial request until requests are submitted to the
   * Direct.dev backend, but reducing network overhead by combining multiple
   * requests into one.
   *
   * @note Providing a negative value will bypass batching altogether and submit
   *       requests instantly.
   *
   * @default 25
   */
  batchWindowMs?: number;

  /**
   * If development mode is enabled, then the client will bypass Direct.dev
   * infrastructure by default for end-users. However, developers can opt into
   * this integration by adding ?directdev=true to the window URL.
   *
   * @note When enabling devMode, request batching is automatically disabled for
   *       end-users to more closely mimic default behaviour.
   *
   * @note We recommend configuring logLevel to "debug" for maximum output
   *       verbosity while debugging issues.
   *
   * @default false
   */
  devMode?: boolean;

  /**
   * If enabled then the Direct RPC endpoint will respond using an NDJSON
   * format, which increases response times but improves developer experience.
   *
   * It is strongly recommended that this setting is only enabled in
   * development environments, as it will negatively impact your production
   * site performance.
   *
   * @default false
   */
  preferJsonFormat?: boolean;

  /**
   * Collection of upstream data provider URLs; we utilize these providers in
   * case of downtime on Direct.dev to provide automatic fail-over directly to
   * your own provider nodes.
   */
  providers: Array<string | [string, Record<string, string>]>;
};

/**
 * Cache entries represent responses received from the Direct.dev
 * infrastructure, which are cacheable for a brief window of time.
 */
type CacheEntry = {
  value: DirectRPCSuccessResponse;

  /**
   * specifies when the entry expires, and can no longer be returned on
   * subsequent requests.
   */
  expiration: {
    whenBlockHeightChanges: boolean;
    expiresAt?: Date;
  };

  /**
   * specifies when the request was created, which is necessary to infer
   * whether or not expiration has occurred due to block height changes.
   */
  inception: {
    blockHeight: string;
  };
};

type MaybeArray<T> = T | T[];

type FetchInput = DirectRPCRequest & { jsonrpc: string };
type FetchOutput = DirectRPCSuccessResponse | DirectRPCErrorResponse;

/**
 * Core client used to perform RPC requests from client to the Direct.dev
 * infrastructure
 */
export class DirectRPCClient {
  #logger: Logger;

  /**
   * specifies if client should bypass Direct.dev infrastructure, as it is
   * currently in development mode.
   */
  #devMode: boolean;

  /**
   * cached configurations to apply when creating new batch windows for sending
   * multiple requests through a single HTTP socket.
   */
  #batchConfig: BatchConfig & { isHttps: boolean };

  /**
   * configuration of batch window as provided when instantiating the client.
   */
  #batchWindowMs: number;

  /**
   * cache of the list of provider nodes, used to perform fail-over handling in
   * cases Direct.dev infrastructure is down.
   */
  #providerNodes: ReadonlyArray<{
    url: string;

    /**
     * specifies which RPC provider who owns this specific node; used when we
     * need to ensure correctness on provider proprietary rpc method calls.
     */
    providerId: SupportedProviderId | undefined;

    /**
     * weighting of the usage of this provider node, reflecting configurations
     * applied when copy+pasting embed code from the Dashboard.
     */
    weighting: number;

    /**
     * additional HTTP headers to inject into calls made to this node from the
     * browser.
     */
    httpHeaders?: Record<string, string>;
  }>;

  /**
   * mapping of back-off configurations for Direct.dev infrastructure itself,
   * as well as any direct provider-node integrations; if present, these
   * endpoints will not be used when performing new requests.
   */
  #backoffMode: Record<
    "direct.dev" | string,
    | {
        failureCount: number;
        endsAt: number;
      }
    | undefined
  > = {};

  /**
   * in-memory cache of currently known block height, which is used to verify
   * validity when reading entries from the local cache map.
   */
  #currentBlockHeight:
    | {
        value: string;
        expiresAt: Date;
      }
    | undefined;

  /**
   * map of cacheable responses currently available locally, including their
   * expiration configurations
   */
  #requestCache = new Map<RPCRequestHash, CacheEntry>();

  /**
   * map of currently in-flight requests, which allows re-use of existing
   * requests if the same ressource is fetched concurrently
   */
  #inflightCache = new Map<RPCRequestHash, Deferred<DirectRPCSuccessResponse | DirectRPCErrorResponse>>();

  /**
   * reference to the currently open batch, so that requests can be pushed onto
   * it until the time of it's submission.
   */
  #currBatch: DirectRPCBatch | undefined;

  /**
   * reference to the timeout which will trigger dispatching of the current
   * batch, allowing opening of a new one as soon as it becomes possible
   */
  #batchTimeout: NodeJS.Timeout | number | undefined;

  /**
   * increments number of requests served from in-memory cache locally.
   */
  #cacheHitCount = 0;

  /**
   * increments number of requests served from inflight uniqueness cache
   * locally.
   */
  #inflightHitCount = 0;

  /**
   * internally collects samples of requests that have been served from
   * in-memory cache, so that they can be emitted upon subsequent requests
   */
  #clientSamples: DirectRPCRequest[] = [];

  /**
   * specifies if this client instance has been destroyed, used to prevent
   * future requests from passing through.
   */
  #isDestroyed = false;

  constructor(config: DirectRPCClientConfig) {
    this.#devMode =
      !!config.devMode && (typeof location === "undefined" || !location.search.includes("directdev=true"));

    // re-map configuration format for providers to internal representation
    this.#providerNodes = config.providers.map((it) =>
      Array.isArray(it)
        ? Object.freeze({
            providerId: deriveProviderFromNodeUrl(it[0]),
            url: it[0],
            httpHeaders: it[1],
            weighting: 1,
          })
        : Object.freeze({
            providerId: deriveProviderFromNodeUrl(it),
            url: it,
            weighting: 1,
          }),
    );

    if (this.#providerNodes.length === 0) {
      throw new Error("new DirectRPCClient(): you must configure at least 1 provider for fail-over handling");
    }

    this.#logger = new Logger({
      prefix: "Direct.dev:",
      level: config.logLevel ?? "info",
    });

    // prepare configurations for handling batches of requests
    this.#batchWindowMs = config.batchWindowMs ?? 25;
    this.#batchConfig = {
      endpointUrl: `${config.baseUrl ?? "https://rpc.direct.dev"}/v1/${encodeURIComponent(config.projectId)}/${encodeURIComponent(config.networkId)}`,
      isHttps: config.baseUrl ? config.baseUrl.startsWith("https://") : false,
    };

    if (config.preferJsonFormat) {
      this.#batchConfig.endpointUrl += "/ndjson";
    }

    if (config.signature) {
      this.#batchConfig.endpointUrl += "?" + config.signature;
    }

    // instantly fetch the initial primer package
    this.#predictivePrimer();

    // subscribe a global listener to handle lifecycle events
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.#handleVisibilityChange);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.#sendBeacon);
    }
  }

  /**
   * performs one or more requests, dispatching them towards the relevant
   * upstream nodes depending on input and configurations.
   */
  async fetch(req: FetchInput): Promise<FetchOutput>;
  async fetch(req: FetchInput[]): Promise<FetchOutput[]>;
  async fetch(req: MaybeArray<FetchInput>): Promise<MaybeArray<FetchOutput>>;
  async fetch(req: MaybeArray<FetchInput>): Promise<MaybeArray<FetchOutput>> {
    //
    // STEP: bypass internal mechanisms completely when operating in
    // development mode
    //
    if (this.#devMode) {
      if (Array.isArray(req)) {
        return this.#fetchChunkFromProviders(req, undefined) as Promise<FetchOutput[]>;
      } else {
        const res = await this.#fetchChunkFromProviders([req], undefined);

        return res[0] as FetchOutput;
      }
    }

    //
    // STEP: if a singular request was given, then verify if the request is
    // supported in the Direct.dev infrastructure - and if not, dispatch it
    // directly to the upstream provider
    //
    if (!Array.isArray(req) && !isSupportedRequest(req)) {
      for await (const response of this.#fetchFromProviders([req])) {
        if (!isRpcSuccessResponse(response) && !isRpcErrorResponse(response)) {
          throw new Error("fetch: received invalid response structure");
        }

        return response;
      }

      this.#logger.error("fetch", "no response received for request", req);
      throw new Error("fetch: no response received for request");
    }

    //
    // STEP: otherwise run the request(s) through the Direct.dev processing
    // pipeline
    //
    try {
      if (!Array.isArray(req)) {
        const reqHash = await wire.hashRPCRequest(req);
        return this.#fetch(reqHash, req);
      } else {
        const reqs = await Promise.all(req.map(async (it) => [await wire.hashRPCRequest(it), it] as const));
        return Promise.all(reqs.map(([reqHash, req]) => this.#fetch(reqHash, req)));
      }
    } finally {
      if (this.#batchWindowMs < 0) {
        // if batching has been disabled, then dispatch the requests immediately
        this.#dispatchBatch();
      } else if (
        this.#batchTimeout === undefined &&
        this.#currBatch !== undefined &&
        this.#currBatch.requests.length > 0
      ) {
        // ... otherwise, if a throttled batch is not currently pending, then
        // dispatch the current request immediately and set a timeout for
        // subsequent requests
        this.#dispatchBatch();
        this.#batchTimeout = setTimeout(() => {
          this.#dispatchBatch();
          this.#batchTimeout = undefined;
        }, this.#batchWindowMs);
      }
    }
  }

  /**
   * handles the request, either by delivering a response from in-memory cache
   * or by adding it to the next batch of requests that will be dispatched
   * shortly.
   */
  async #fetch(reqHash: RPCRequestHash, req: FetchInput): Promise<FetchOutput> {
    if (!isRpcRequest(req)) {
      throw new Error("#fetch(): invalid input provided, must conform to jsonrpc spec.");
    }

    if (this.#isDestroyed) {
      throw new Error("#fetch(): called after destroying the client instance.");
    }

    return (
      (async () => {
        const cacheEntry = this.#requestCache.get(reqHash);

        // if the request has been previously cached, determine if it is still
        // fresh and return directly from there
        if (cacheEntry) {
          const now = new Date();

          const expiredByTimeToLive = cacheEntry.expiration.expiresAt && cacheEntry.expiration.expiresAt < now;
          const expiredByBlockHeight =
            cacheEntry.expiration.whenBlockHeightChanges &&
            (this.#currentBlockHeight == null ||
              this.#currentBlockHeight.expiresAt < now ||
              cacheEntry.inception.blockHeight !== this.#currentBlockHeight?.value);

          if (!expiredByTimeToLive && !expiredByBlockHeight) {
            this.#cacheHitCount++;
            this.#clientSamples.push(req);

            return cacheEntry.value;
          } else {
            this.#requestCache.delete(reqHash);
          }
        }

        // if the request is already inflight, then re-use existing promise
        // and simply re-wrap the response with the expected ID
        const inflightPromise = this.#inflightCache.get(reqHash);

        if (inflightPromise) {
          this.#inflightHitCount++;
          this.#clientSamples.push(req);

          return inflightPromise;
        }

        // ... if we get here, this is a unique request - create an inflight
        // promise for it, and push it to the next batch
        const promise = makeDeferred<DirectRPCSuccessResponse | DirectRPCErrorResponse>();

        this.#inflightCache.set(reqHash, promise);

        this.#currBatch ??= createBatch(this.#batchConfig, this.#logger);
        this.#currBatch.add(req);

        promise.then(() => {
          this.#inflightCache.delete(reqHash);
        });

        return promise;
      })()
        // re-wrap response with an ID identical to the incoming request (in
        // case we've read data from cache or inflight requests, we cannot be
        // sure that the received response ID matches the incoming request ID)
        .then((res) => ({ ...res, jsonrpc: "jsonrpc" in res ? res.jsonrpc : "2.0", id: req.id }))
    );
  }

  /**
   * trigger a request to Direct.dev layer, to fetch primer package for the
   * current context.
   */
  async #predictivePrimer() {
    if (this.#devMode) {
      return;
    }

    this.#logger.debug("#predictivePrimer", "requesting primer package for most popular requests");

    const req = {
      jsonrpc: "2.0",
      id: 1,
      method: "direct_primer",
      params: [normalizeContextFromUrl(typeof window !== "undefined" ? window.location.href : "/")],
    };

    // push the primer request to the list of pending requests, and then
    // instantly dispatch waiting requests
    this.#currBatch ??= createBatch(this.#batchConfig, this.#logger);
    this.#currBatch.add(req);
    this.#dispatchBatch();
  }

  /**
   * dispatch pending requests in a singular batch, and resolve inflight
   * promises as soon as possible
   */
  #dispatchBatch = async () => {
    if (!this.#currBatch) {
      // bail out if no batch exists
      return;
    }

    const currBatch = this.#currBatch;
    this.#currBatch = undefined;

    // if the current block height is no longer guaranteed to be valid, then
    // re-fetch primer package
    //
    // (this is only a temporary meassure, until we are ready to implement
    // predictive prefetching for real)
    if (!this.#currentBlockHeight || this.#currentBlockHeight.expiresAt < new Date()) {
      if (!currBatch.requests.some((req) => req.method === "direct_primer")) {
        currBatch.add({
          id: 0,
          method: "direct_primer",
          params: [normalizeContextFromUrl(typeof window !== "undefined" ? window.location.href : "/")],
        });
      }
    }

    // re-map ids on requests, so that they're equal to the index of the
    // request in the batch list (this is useful when receiving responses as
    // it allows us to quickly identify the associated request hash and
    // resolve the correct inflight promise)
    const requestHashes = await Promise.all(currBatch.requests.map((it) => wire.hashRPCRequest(it)));
    const remainingRequestHashes = new Set(requestHashes);

    // perform request to upstream, and handle responses by resolving batched
    // entries
    const backoffMode = this.#backoffMode["direct.dev"];
    const [isDirectRequest, iterator] =
      !backoffMode || backoffMode.endsAt <= Date.now()
        ? await this.#fetchFromDirect(currBatch)
        : [false, this.#fetchFromProviders(currBatch.requests)];

    let isDirectHeadPending = isDirectRequest;

    for await (const { value: response } of iterator) {
      // if we're waiting for the head of a response, then parse it as such
      if (isDirectHeadPending) {
        if (!("predictions" in response)) {
          throw new Error("DirectRPCClient: invalid response structure received, expected head");
        }

        isDirectHeadPending = false;

        // for all incoming predictions, instantly register them as being
        // inflight to prevent duplication on future events
        for (const predictedReqHash of response.predictions) {
          if (!this.#inflightCache.has(predictedReqHash)) {
            const promise = makeDeferred<DirectRPCSuccessResponse | DirectRPCErrorResponse>();

            promise.then(() => {
              this.#inflightCache.delete(predictedReqHash);
            });

            // create inflight cache for the predicted request, to avoid
            // duplication in subsequent fetches
            this.#inflightCache.set(predictedReqHash, promise);
          }

          // update internal state to reflect the predicted request
          requestHashes.push(predictedReqHash);
          remainingRequestHashes.add(predictedReqHash);
        }

        // update currently known block height
        this.#currentBlockHeight =
          response.blockHeight && response.blockHeightExpiresAt
            ? {
                value: response.blockHeight,
                expiresAt: new Date(response.blockHeightExpiresAt),
              }
            : undefined;

        continue;
      }

      // ... otherwise parse the response, resolve external promises and apply
      // to cache if relevant
      if (!isRpcSuccessResponse(response) && !isRpcErrorResponse(response)) {
        throw new Error("#dispatchBatch: received invalid response structure");
      }

      const reqHash = requestHashes[+response.id - 1];

      if (!reqHash) {
        this.#logger.error(
          "#dispatchBatch",
          `could not map response ID '${response.id}' to request hash, unable to resolve response`,
        );
        continue;
      }

      remainingRequestHashes.delete(reqHash);
      this.#inflightCache.get(reqHash)?.__resolve(response);

      if (
        reqHash &&
        ("expiresWhenBlockHeightChanges" in response || "expiresAt" in response) &&
        this.#currentBlockHeight
      ) {
        this.#requestCache.set(reqHash, {
          value: response,
          expiration: {
            whenBlockHeightChanges: response.expiresWhenBlockHeightChanges ?? false,
            expiresAt: response.expiresAt ? new Date(response.expiresAt) : undefined,
          },
          inception: {
            blockHeight: this.#currentBlockHeight.value,
          },
        });
      }
    }

    // after having received all responses, iterate through any missing
    // promises and ensure that they are provided with a response
    for (const reqHash of remainingRequestHashes) {
      this.#inflightCache.get(reqHash)?.__resolve({
        id: -1,
        error: {
          code: 85000,
          message: "no response received for request (Direct.dev)",
        },
      });
    }
  };

  /**
   * perform RPC requests against the Direct.dev infrastructure layer
   */
  async #fetchFromDirect(
    batch: DirectRPCBatch,
  ): Promise<
    [
      isDirectHeadPending: boolean,
      AsyncGenerator<{ done: boolean; value: DirectRPCHead | DirectRPCSuccessResponse | DirectRPCErrorResponse }>,
    ]
  > {
    const cacheHitCount = this.#cacheHitCount;
    const inflightHitCount = this.#inflightHitCount;
    const samples = this.#clientSamples;

    this.#clientSamples = [];

    // dispatch request including metrics data to the Direct.dev layer for
    // further processing
    const response = await batch.dispatch({ cacheHitCount, inflightHitCount, samples });

    if (response) {
      // if things went OK, then reset any previously known backoff-settings
      // and continue operations as usual from here
      this.#backoffMode["direct.dev"] = undefined;

      return [true, response];
    }

    // if something went wrong in the Direct.dev layer, restore state and
    // perform fail-over
    const now = Date.now();

    // restore in-memory copy of local cache hits, as we were unable to
    // sample them in the backend layer
    this.#cacheHitCount += cacheHitCount;
    this.#inflightHitCount += inflightHitCount;

    for (const req of samples) {
      this.#clientSamples.push(req);
    }

    // register the error internally, so we can perform exponential backoff
    // if we're not already in a backoff-period
    const backoffMode = this.#backoffMode["direct.dev"];

    if (!backoffMode || backoffMode.endsAt < now) {
      const prevFailureCount = backoffMode?.failureCount ?? 0;

      this.#backoffMode["direct.dev"] = {
        failureCount: prevFailureCount + 1,
        endsAt: now + 2 ** Math.min(8, prevFailureCount) * BASE_BACKOFF_DURATION_MS,
      };

      this.#logger.debug("#fetchFromDirect", "backing off until", new Date(this.#backoffMode["direct.dev"].endsAt));
    }

    // retry the same requests in failover-mode to guarantee
    this.#logger.debug("#fetchFromDirect", "retrying failed requests from providers", batch.requests);

    return [false, this.#fetchFromProviders(batch.requests)];
  }

  /**
   * fail-over mechanism to perform requests directly against the designated
   * provider nodes
   */
  #fetchFromProviders(
    requests: DirectRPCRequest[],
  ): AsyncGenerator<{ done: boolean; value: DirectRPCSuccessResponse | DirectRPCErrorResponse }> {
    //
    // STEP: split requests into batches, which can be performed against
    // specific providers
    //
    const providerBatches = requests.reduce(
      (acc, req) => {
        const providerId = deriveProviderFromRequest(req) ?? "";

        if (providerId === "direct.dev") {
          // requests for the Direct.dev infrastructure is currently
          // unavailable, silently ignore
          this.#logger.debug(
            "#fetchFromProviders",
            "unable to perform Direct.dev proprietary request, currently in failover mode",
            req,
          );
          return acc;
        }

        acc[providerId] ??= [];
        acc[providerId].push(req);

        return acc;
      },
      {} as Record<SupportedProviderId | "", DirectRPCRequest[]>,
    );

    //
    // STEP: chunk batches, so we never emit too many requests in a single batch
    //
    const chunks = Object.entries(providerBatches).flatMap(([providerId, requests]) => {
      return chunkArray(requests, BATCH_MAX_SIZE).map((chunk) => ({
        requests: chunk,
        providerId: (providerId || undefined) as SupportedProviderId | undefined,
      }));
    });

    const generator = new PushableAsyncGenerator<{
      done: false;
      value: DirectRPCSuccessResponse | DirectRPCErrorResponse;
    }>(async (emit) => {
      await Promise.allSettled(
        chunks.map(async ({ requests, providerId }) => {
          const res = await this.#fetchChunkFromProviders(requests, providerId);

          for (const item of res) {
            emit({ done: false, value: item });
          }
        }),
      );
    });

    return generator;
  }

  /**
   * internal helper that performs fetching of responses for a chunk of
   * requests; also handles exponential node backoff and fail-over on requests
   */
  async #fetchChunkFromProviders(
    chunk: DirectRPCRequest[],
    providerId: SupportedProviderId | undefined,
    failoverMode = false,
  ): Promise<Array<DirectRPCSuccessResponse | DirectRPCErrorResponse>> {
    //
    // STEP: determine which node to use to perform this request based on
    // incoming configurations
    //
    const providerNodes =
      providerId == null ? this.#providerNodes : this.#providerNodes.filter((it) => it.providerId === providerId);

    // grab a list of provider nodes, which are not currently under
    // exponential back-off
    const availableNodes = (() => {
      const filteredNodes = providerNodes.filter((it) => {
        const backoffMode = this.#backoffMode[it.url];

        return !backoffMode || backoffMode.endsAt < Date.now();
      });

      return filteredNodes.length > 0 ? filteredNodes : providerNodes;
    })();

    const node = weightedPick(availableNodes);

    try {
      //
      // STEP: perform the request, ensure response correctness and return for
      // further processing in parent function
      //
      const req = await fetch(node.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...node.httpHeaders,
        },
        body: JSON.stringify(chunk),
      });

      if (!req.ok) {
        throw new Error("#fetchChunkFromProviders: unknown server error occurred");
      }

      // validate the structure of the responses
      const res = await req.json();
      const responses = Array.isArray(res) ? res : [res];

      for (const res of responses) {
        if (!isRpcSuccessResponse(res) && !isRpcErrorResponse(res)) {
          throw new Error("#fetchChunkFromProviders: received invalid response");
        }
      }

      // if we get here, things went OK, reset any previous backoff data and
      // continue operations as usual through the Direct.dev infrastructure
      this.#backoffMode[node.url] = undefined;

      return responses;
    } catch (err) {
      //
      // STEP: handle errors to configure exponential backoff of nodes and
      // automatic failover routing
      //
      if (failoverMode) {
        // if we're already operating in fail-over mode, then throw the error
        // externally to break execution
        throw err;
      }

      // if we get here, something went wrong - bump exponential backoff if
      // this node is not already in backoff mode
      const now = Date.now();
      const backoffMode = this.#backoffMode[node.url];

      if (!backoffMode || backoffMode.endsAt < now) {
        const prevFailureCount = backoffMode?.failureCount ?? 0;

        this.#backoffMode[node.url] = {
          failureCount: prevFailureCount + 1,
          endsAt: now + 2 ** Math.min(8, prevFailureCount) * BASE_BACKOFF_DURATION_MS,
        };
      }

      // retry the request, routing it through one of the other supplied
      // provider nodes
      return this.#fetchChunkFromProviders(chunk, providerId, true);
    }
  }

  /**
   * global listener for the "visibility change" event, which allows us to:
   *
   * - re-fetch primer package if a user returns to the after a period of
   *   inactivity
   * - dispatch samples of any unsubmitted local cache hits, ensuring
   *   correctness of the RPC Agent's popularity scoring for requests
   */
  #handleVisibilityChange = () => {
    switch (document.visibilityState) {
      case "hidden":
        this.#sendBeacon();
        return;

      case "visible":
        this.#predictivePrimer();
        break;
    }
  };

  /**
   * submit local cache hits that have not yet been sampled by the Direct.dev
   * RPC Agent, so that we ensure correctness of popularity scoring.
   */
  #sendBeacon = async () => {
    const cacheHitCount = this.#cacheHitCount;
    const inflightHitCount = this.#inflightHitCount;
    const samples = this.#clientSamples;

    if (cacheHitCount === 0 && inflightHitCount === 0 && samples.length === 0) {
      // avoid dispatching anything if there are no metrics to deliver to the
      // upstream
      return;
    }

    // encode the metrics using a wire stream
    const encodeStream = new WireEncodeStream();

    encodeStream.close(
      wire.clientMetrics.encode({
        cacheHitCount,
        inflightHitCount,
        samples,
      }),
    );

    navigator.sendBeacon(this.#batchConfig.endpointUrl, await new WireDecodeStream(encodeStream).toString());

    // reset in-memory samples and hope that the beacon goes through for proper
    // collection of metrics
    this.#clientSamples = [];
  };

  /**
   * Destroy this client instance, preventing any further requests from being
   * dispatched to the Direct.dev infrastructure.
   */
  destroy() {
    this.#isDestroyed = true;

    // submit any unsent telemetry to the Direct.dev infrastructure
    this.#sendBeacon();

    // prevent any future batches from being triggered
    clearTimeout(this.#batchTimeout);
    this.#batchTimeout = undefined;
  }
}
