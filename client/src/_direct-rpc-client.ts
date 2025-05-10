import type {
  Deferred,
  SupportedProviderId,
  DirectRPCErrorResponse,
  DirectRPCRequest,
  DirectRPCSuccessResponse,
  LogLevel,
  RPCRequestHash,
  DirectRPCHead,
  SupportedNetworkId,
} from "@direct.dev/shared";
import {
  Logger,
  PushableAsyncGenerator,
  deriveProviderFromNodeUrl,
  deriveProviderFromRequest,
  makeDeferred,
  weightedPick,
} from "@direct.dev/shared";
import { sha256, wire } from "@direct.dev/wire";

import type { BatchConfig, DirectRPCBatch } from "./batch.core.js";
import { isRpcErrorResponse, isRpcRequest, isRpcSuccessResponse } from "./guards.js";
import { createBatch } from "./util.create-batch.js";
import { generateSessionId } from "./util.generate-session-id.js";
import { isSupportedRequest } from "./util.is-supported-request.js";
import { normalizeElementReference } from "./util.normalize-element-reference.js";
import { normalizeContextFromUrl } from "./util.normalize-url.js";

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
  networkId: SupportedNetworkId;

  /**
   * When copy+pasting integration codes from Direct.dev, a token is provided
   * which allows your project to cold start faster - this removes latency on
   * initial requests after periods of inactivity.
   */
  projectToken?: string;

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
   * If enabled then the Direct RPC endpoint will respond using an NDJSON
   * format, which increases response times but improves developer experience.
   *
   * It is strongly recommended that this setting is only enabled in
   * development environments, as it will negatively impact your production
   * site performance.
   *
   * @default false
   */
  preferJSON?: boolean;

  /**
   * If enabled, then Direct will attempt to fetch primer packages to respond
   * faster to user interactions (ie. clicks on interactive elements).
   *
   * @default false
   */
  predictOnClick?: boolean;

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
 * configuration of provider upstream nodes, which are used when bypassing
 * Direct.dev infrastructure while running requests.
 */
type ProviderNode = {
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
};

type NodeBackoffState = {
  /**
   * timestamp (Date.now()) for when the backoff ends (ie. after this point,
   * the client can retry requests against the specified node again)
   */
  endsAt: number;

  /**
   * the number of consecutive failures observed while requesting data from
   * this node
   */
  failureCount: number;
};

/**
 * Core client used to perform RPC requests from client to the Direct.dev
 * infrastructure
 */
export class DirectRPCClient {
  #logger: Logger;

  /**
   * specifies the URL which should be used when connecting to Direct.dev
   */
  readonly endpointUrl: string;

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
  #providerNodes: readonly ProviderNode[];

  /**
   * configuration of Direct.dev infrastructure backoff state, which is enabled
   * when rpc.direct.dev is down. While enabled, all requests will bypass
   * Direct.dev to be able to eliminate all single-points-of-failure within the
   * call stack.
   */
  #directDevBackoff: NodeBackoffState | undefined;

  /**
   * mapping of backoff-state for available provider nodes, so we can ensure
   * that requests are not run against providers that are known to experience
   * service issues currently.
   */
  #providerBackoff = new Map<ProviderNode, NodeBackoffState>();

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
  #requestCache = new Map<RPCRequestHash, CacheEntry & { prefetched: boolean }>();

  /**
   * map of currently in-flight requests, which allows re-use of existing
   * requests if the same ressource is fetched concurrently
   */
  #inflightCache = new Map<
    RPCRequestHash,
    Deferred<DirectRPCSuccessResponse | DirectRPCErrorResponse> & { prefetched: boolean }
  >();

  /**
   * reference to the currently open batch, so that requests can be pushed onto
   * it until the time of it's submission.
   */
  #currBatch: DirectRPCBatch | undefined;

  /**
   * used to create a promise when current batch is being dispatched, which
   * will resolve once we can guarantee that all predictively prefetched hashes
   * has resolved (in order to avoid re-fetching the same requests again in the
   * background).
   */
  #waitForCurrBatchHead: Deferred<void> | undefined;

  /**
   * reference to the timeout which will trigger dispatching of the current
   * batch, allowing opening of a new one as soon as it becomes possible
   */
  #batchTimeout: NodeJS.Timeout | number | undefined;

  /**
   * internally collects collection of requests that were served from in-memory
   * cache, so that they can be sampled for popularity subsequently
   */
  #cacheHits: wire.RequestTailEntry[] = [];

  /**
   * internally collects collection of requests that were prefetched and
   * subsequently served from in-memory cache, so that they can be sampled for
   * popularity subsequently
   */
  #prefetchHits: wire.RequestTailEntry[] = [];

  /**
   * internally collects collection of requests that were served from inflight
   * uniqueness cache, so that they can be sampled for popularity subsequently
   */
  #inflightHits: wire.RequestTailEntry[] = [];

  /**
   * specifies if this client instance has been destroyed, used to prevent
   * future requests from passing through.
   */
  #isDestroyed = false;

  constructor(config: DirectRPCClientConfig) {
    this.endpointUrl = `${config.baseUrl ?? "https://rpc.direct.dev"}/v1/${encodeURIComponent(config.projectToken ? config.projectId + "." + config.projectToken : config.projectId)}/${encodeURIComponent(config.networkId)}`;
    this.#devMode =
      !!config.devMode && (typeof location === "undefined" || !location.search.includes("directdev=true"));

    // re-map configuration format for providers to internal representation
    this.#providerNodes = config.providers.map((it) =>
      Array.isArray(it)
        ? Object.freeze({
            providerId: deriveProviderFromNodeUrl(config.networkId, it[0]),
            url: it[0],
            httpHeaders: it[1],
            weighting: 1,
          })
        : Object.freeze({
            providerId: deriveProviderFromNodeUrl(config.networkId, it),
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
      sessionId: generateSessionId(),
      endpointUrl: this.endpointUrl,
      preferJSON: config.preferJSON,
      isHttps: config.baseUrl ? config.baseUrl.startsWith("https://") : false,
    };

    // instantly fetch the initial primer package
    this.#predictivePrimerFor("load", normalizeContextFromUrl());

    // subscribe to in-browser events to predictively prime cache
    if (typeof window !== "undefined") {
      window.addEventListener("directdev:navigation", this.#handleNavigation);
      window.addEventListener("pagehide", this.#sendBeacon);
      document.addEventListener("visibilitychange", this.#handleVisibilityChange);

      if (config.predictOnClick === true) {
        document.addEventListener("click", this.#handleClick, { capture: true });
      }
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
        return response.value;
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
      } else {
        await this.#waitForCurrBatchHead;

        if (this.#batchTimeout === undefined && this.#currBatch !== undefined && this.#currBatch.size > 0) {
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

    // deliver eth_blockNumber from in-memory cache if available
    if (
      req.method === "eth_blockNumber" &&
      this.#currentBlockHeight?.value &&
      this.#currentBlockHeight.expiresAt.getTime() > Date.now()
    ) {
      this.#cacheHits.push({ ...req, timestamp: new Date(), blockHeight: this.#currentBlockHeight?.value });

      return {
        id: req.id,
        result: this.#currentBlockHeight,
      };
    }

    return (
      (async () => {
        const cacheEntry = this.#requestCache.get(reqHash);

        // if the request has been previously cached, determine if it is still
        // fresh and return directly from there
        if (cacheEntry) {
          const now = Date.now();

          const expiredByTimeToLive =
            cacheEntry.expiration.expiresAt && cacheEntry.expiration.expiresAt.getTime() < now;
          const expiredByBlockHeight =
            cacheEntry.expiration.whenBlockHeightChanges &&
            (this.#currentBlockHeight == null ||
              this.#currentBlockHeight.expiresAt.getTime() < now ||
              cacheEntry.inception.blockHeight !== this.#currentBlockHeight?.value);

          if (!expiredByTimeToLive && !expiredByBlockHeight) {
            (!cacheEntry.prefetched ? this.#cacheHits : this.#prefetchHits).push({
              ...req,
              timestamp: new Date(),
              blockHeight: this.#currentBlockHeight?.value,
            });

            return cacheEntry.value;
          } else {
            this.#requestCache.delete(reqHash);
          }
        }

        // wait for current head to be fully fetched, so we can correctly check
        // inflight uniqueness against predictive prefetches
        await this.#waitForCurrBatchHead;

        // if the request is already inflight, then re-use existing promise
        // and simply re-wrap the response with the expected ID
        const inflightPromise = this.#inflightCache.get(reqHash);

        if (inflightPromise) {
          (!inflightPromise.prefetched ? this.#inflightHits : this.#prefetchHits).push({
            ...req,
            timestamp: new Date(),
            blockHeight: this.#currentBlockHeight?.value,
          });

          return inflightPromise;
        }

        // ... if we get here, this is a unique request - create an inflight
        // promise for it, and push it to the next batch
        const promise = makeDeferred<DirectRPCSuccessResponse | DirectRPCErrorResponse>();

        this.#inflightCache.set(reqHash, Object.assign(promise, { prefetched: false }));

        this.#currBatch ??= createBatch(this.#batchConfig, this.#logger);
        this.#currBatch.push(req);

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
  async #predictivePrimerFor(event: string, context: string) {
    if (this.#devMode) {
      return;
    }

    this.#logger.debug("#predictivePrimerFor", "requesting primer package", { event, context });

    const req = {
      jsonrpc: "2.0",
      id: 1,
      method: "direct_primer",
      params: [event, await sha256(context)],
    };

    // push the primer request to the list of pending requests, and then
    // instantly dispatch waiting requests
    this.#currBatch ??= createBatch(this.#batchConfig, this.#logger);
    this.#currBatch.push(req);
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

    // create a promise which will resolve once the current request completes
    // fully
    const waitForHead = (this.#waitForCurrBatchHead = makeDeferred());

    try {
      // re-map ids on requests, so that they're equal to the index of the
      // request in the batch list (this is useful when receiving responses as
      // it allows us to quickly identify the associated request hash and
      // resolve the correct inflight promise)
      const requests = await currBatch.requests;
      const requestHashes = await Promise.all(requests.map((it) => wire.hashRPCRequest(it)));
      const predictions: string[] = [];
      const remainingRequestHashes = new Set(requestHashes);

      // perform request to upstream, and handle responses by resolving batched
      // entries
      const [isDirectRequest, iterator] =
        !this.#directDevBackoff || this.#directDevBackoff.endsAt <= Date.now()
          ? await this.#fetchFromDirect(currBatch)
          : [false, this.#fetchFromProviders(requests)];

      if (!isDirectRequest) {
        // instantly stop holding back subsequent batches, if the request was
        // not handled through Direct.dev infrastructure (predictive prefetching
        // will never kick in from third-party providers)
        waitForHead.__resolve();
      }

      for await (const segment of iterator) {
        // if we're waiting for the head of a response, then parse it as such
        if (segment.type === "head") {
          const head = segment.value;

          // for all incoming predictions, instantly register them as being
          // inflight to prevent duplication on future events
          for (const predictedReqHash of head.predictions) {
            if (!this.#inflightCache.has(predictedReqHash)) {
              const promise = makeDeferred<DirectRPCSuccessResponse | DirectRPCErrorResponse>();

              promise.then(() => {
                this.#inflightCache.delete(predictedReqHash);
              });

              // create inflight cache for the predicted request, to avoid
              // duplication in subsequent fetches
              this.#inflightCache.set(predictedReqHash, Object.assign(promise, { prefetched: true }));
            }

            // update internal state to reflect the predicted request
            requestHashes.push(predictedReqHash);
            predictions.push(predictedReqHash);
            remainingRequestHashes.add(predictedReqHash);
          }

          // update currently known block height
          this.#currentBlockHeight =
            head.blockHeight && head.blockHeightExpiresAt
              ? {
                  value: head.blockHeight,
                  expiresAt: head.blockHeightExpiresAt,
                }
              : undefined;

          waitForHead.__resolve();
          continue;
        }

        // ... otherwise parse the response, resolve external promises and apply
        // to cache if relevant
        const response = segment.value;
        const reqHash = requestHashes[+response.id - 1];

        if (!reqHash) {
          this.#logger.error(
            "#dispatchBatch",
            `could not map response ID '${response.id}' to request hash, unable to resolve response`,
            {
              requestHashes,
              predictions,
              response,
            },
          );
          continue;
        }

        remainingRequestHashes.delete(reqHash);

        // slight CPU overhead (~0,01-0,05ms pr. response object), ensuring
        // that responses decoded through the Wire protocol will have
        // identical structure to responses decoded through regular JSON
        //
        // namely, this ensures that "undefined" optional properties are
        // omitted in the emitted object, whereas Wire will include them as
        // undefined values
        const output = JSON.parse(
          JSON.stringify({ ...response, expiresWhenBlockHeightChanges: undefined, expiresAt: undefined }),
        );

        this.#inflightCache.get(reqHash)?.__resolve(output);

        if (reqHash && "result" in response && this.#currentBlockHeight) {
          this.#requestCache.set(reqHash, {
            value: output,
            expiration: {
              whenBlockHeightChanges: response.expiresWhenBlockHeightChanges ?? false,
              expiresAt: response.expiresAt ?? undefined,
            },
            inception: {
              blockHeight: this.#currentBlockHeight.value,
            },

            // if response ID exceeds the bounds of incoming requests, it was
            // predictively prefetched
            prefetched: +response.id > requests.length,
          });
        }
      }

      // ensure that head promise is resolved, in edge cases where Direct.dev
      // failed to deliver head segment
      if (!waitForHead.__isFulfilled()) {
        waitForHead.__resolve();
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
    } finally {
      // ensure that we always resolve head proimse to avoid hanging forever
      if (!waitForHead.__isFulfilled()) {
        waitForHead.__resolve();
      }
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
      AsyncGenerator<
        | { type: "head"; value: DirectRPCHead }
        | { type: "item"; value: DirectRPCSuccessResponse | DirectRPCErrorResponse }
      >,
    ]
  > {
    const cacheHits = this.#cacheHits;
    const prefetchHits = this.#prefetchHits;
    const inflightHits = this.#inflightHits;

    this.#cacheHits = [];
    this.#prefetchHits = [];
    this.#inflightHits = [];

    // dispatch request including metrics data to the Direct.dev layer for
    // further processing
    const response = await batch.dispatch({ cacheHits, prefetchHits, inflightHits });

    if (response) {
      // if things went OK, then reset any previously known backoff-settings
      // and continue operations as usual from here
      this.#directDevBackoff = undefined;

      return [true, response];
    }

    // if something went wrong in the Direct.dev layer, restore state and
    // perform fail-over
    const now = Date.now();

    // restore in-memory copy of local cache hits, as we were unable to
    // sample them in the backend layer
    for (const req of cacheHits) {
      this.#cacheHits.push(req);
    }

    for (const req of inflightHits) {
      this.#inflightHits.push(req);
    }

    // register the error internally, so we can perform exponential backoff
    // if we're not already in a backoff-period

    if (!this.#directDevBackoff || this.#directDevBackoff.endsAt < now) {
      const prevFailureCount = this.#directDevBackoff?.failureCount ?? 0;

      this.#directDevBackoff = {
        failureCount: prevFailureCount + 1,
        endsAt: now + 2 ** Math.min(8, prevFailureCount) * BASE_BACKOFF_DURATION_MS,
      };

      this.#logger.debug("#fetchFromDirect", "entering back-off mode", {
        endsAt: new Date(this.#directDevBackoff.endsAt),
      });
    }

    // retry the same requests in failover-mode to guarantee
    const requests = await batch.requests;
    this.#logger.debug("#fetchFromDirect", "retrying failed requests from providers", { requests });

    return [false, this.#fetchFromProviders(requests)];
  }

  /**
   * fail-over mechanism to perform requests directly against the designated
   * provider nodes
   */
  #fetchFromProviders(
    requests: DirectRPCRequest[],
  ): AsyncGenerator<{ type: "item"; value: DirectRPCSuccessResponse | DirectRPCErrorResponse }> {
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
    // STEP: submit batches to requested providers
    //
    const generator = new PushableAsyncGenerator<{
      type: "item";
      value: DirectRPCSuccessResponse | DirectRPCErrorResponse;
    }>(async (emit) => {
      await Promise.allSettled(
        Object.entries(providerBatches).map(async ([providerId, requests]) => {
          const res = await this.#fetchChunkFromProviders(
            requests,
            (providerId || undefined) as SupportedProviderId | undefined,
          );

          for (const item of res) {
            emit({ type: "item", value: item });
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
      const excludedNodes = Array.from(this.#providerBackoff.entries())
        .filter(([, backoff]) => backoff.endsAt < Date.now())
        .map(([node]) => node);

      if (!excludedNodes.length) {
        return providerNodes;
      }

      // if we need to exclude specific nodes, start by trying to find
      // another node that's associated with a completely different provider
      if (providerId == null) {
        const otherProviderNodes = providerNodes.filter(
          (node) => !excludedNodes.some((excludedNode) => node.providerId !== excludedNode.providerId),
        );

        if (otherProviderNodes.length > 0) {
          return otherProviderNodes;
        }
      }

      // ... otherwise attempt to find any other node than the excluded one
      const otherNodes = providerNodes.filter((node) =>
        excludedNodes.some((excludedNode) => node.url !== excludedNode.url),
      );

      if (otherNodes.length > 0) {
        return otherNodes;
      }

      // ... finally if no other nodes exist, retry against the same node
      // again
      return providerNodes;
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
      this.#providerBackoff.delete(node);

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
      const backoffMode = this.#providerBackoff.get(node);

      if (!backoffMode || backoffMode.endsAt < now) {
        const prevFailureCount = backoffMode?.failureCount ?? 0;

        this.#providerBackoff.set(node, {
          failureCount: prevFailureCount + 1,
          endsAt: now + 2 ** Math.min(8, prevFailureCount) * BASE_BACKOFF_DURATION_MS,
        });
      }

      // retry the request, routing it through one of the other supplied
      // provider nodes
      return this.#fetchChunkFromProviders(chunk, providerId, true);
    }
  }

  /**
   * handle clicks on interactive elements and predictively prime cache if
   * relevant based on the clicked element.
   */
  #handleClick = (evt: Event) => {
    const target = evt.target as HTMLElement;

    // track only clicks on interactive elements
    const el = target.closest("a, button, [role='button']") as HTMLElement | null;
    if (!el) return;

    // generate context from clicked element
    const ref = normalizeElementReference(el);
    const context = `${normalizeContextFromUrl()}::${ref}`;

    this.#predictivePrimerFor("click", context);
  };

  /**
   * handle SPA navigation and predictively prime cache for the newly opened
   * URL.
   */
  #handleNavigation = () => {
    this.#predictivePrimerFor("navigation", normalizeContextFromUrl());
  };

  /**
   * handle the "visibility change" event, which allows us to:
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
        this.#predictivePrimerFor("visibilityChange", normalizeContextFromUrl());
        break;
    }
  };

  /**
   * submit local cache hits that have not yet been sampled by the Direct.dev
   * RPC Agent, so that we ensure correctness of popularity scoring.
   */
  #sendBeacon = async () => {
    const cacheHits = this.#cacheHits;
    const prefetchHits = this.#prefetchHits;
    const inflightHits = this.#inflightHits;

    if (cacheHits.length === 0 && prefetchHits.length === 0 && inflightHits.length === 0) {
      // avoid dispatching anything if there are no metrics to deliver to the
      // upstream
      return;
    }

    navigator.sendBeacon(
      this.endpointUrl,
      new Blob(
        [
          JSON.stringify({
            type: "tail",
            value: {
              cacheHits,
              prefetchHits,
              inflightHits,
            },
          }),
        ],
        {
          type: "application/x-ndjson",
        },
      ),
    );

    // reset in-memory samples and hope that the beacon goes through for proper
    // collection of metrics
    this.#cacheHits = [];
    this.#prefetchHits = [];
    this.#inflightHits = [];
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

// monkey patching of pushState and replaceState, emitting CustomEvent to allow
// safe interception of SPA navigation events
if (typeof window !== "undefined") {
  const dispatchNavEvent = () => window.dispatchEvent(new CustomEvent("directdev:navigation"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap = <T extends (...args: any[]) => any>(fn: T): ((...args: Parameters<T>) => ReturnType<T>) => {
    return (...args: Parameters<T>): ReturnType<T> => {
      try {
        return fn.apply(this, args) as ReturnType<T>;
      } finally {
        dispatchNavEvent();
      }
    };
  };

  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);

  window.addEventListener("popstate", dispatchNavEvent);
  window.addEventListener("hashchange", dispatchNavEvent);
}
