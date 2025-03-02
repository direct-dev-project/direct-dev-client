import type {
  Deferred,
  SupportedProviderId,
  DirectRPCErrorResponse,
  DirectRPCRequest,
  DirectRPCSuccessResponse,
  LogLevel,
  RPCRequestHash,
} from "@direct.dev/shared";
import {
  Logger,
  chunkArray,
  deriveProviderFromNodeUrl,
  deriveProviderFromRequest,
  hashRPCRequest,
  makeAsyncGeneratorFromEmitter,
  makeDeferred,
  makeGeneratorFromNDJsonResponse,
  weightedPick,
} from "@direct.dev/shared";

import { isDirectRPCHead, isRpcErrorResponse, isRpcRequest, isRpcSuccessResponse } from "./guards.js";
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
type Config = {
  projectId: string;
  networkId: string;

  /**
   * Override the baseUrl used when connecting to Direct infrastructure, useful
   * especially when running a local testing environment.
   *
   * @default "https://direct.dev"
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
   * @default 50
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
   * cache of the Direct.dev infrastructure entry worker URL, based on initial
   * configurations supplied to the client.
   */
  #directUrl: string;

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
   * collection of requests to be triggered upon the next batch, indexed by
   * hash so that we can safely reference the and resolve the correct inflight
   * promise.
   */
  #nextBatch = new Map<RPCRequestHash, DirectRPCRequest>();

  /**
   * reference to the timeout which will trigger the next batch to be submitted
   * to the
   */
  #nextBatchTimeout: number | undefined;

  /**
   * internally collects requests returned from local cache, so they can be
   * submitted for popularity sampling in the RPC Agent upon next physical
   * request.
   */
  #cacheHits: DirectRPCRequest[] = [];

  /**
   * specifies if a batch is currently dispatched to the Direct.dev
   * infrastructure, without having received a response head - in this case, we
   * hold back any subsequent batches to ensure that predictively prefetched
   * ressources aren't duplicated
   */
  #isDirectHeadPending = false;

  /**
   * specifies if this client instance has been destroyed, used to prevent
   * future requests from passing through.
   */
  #isDestroyed = false;

  constructor(config: Config) {
    this.#directUrl = `${config.baseUrl ?? "https://direct.dev"}/v1/rpc/${encodeURIComponent(config.projectId)}/${encodeURIComponent(config.networkId)}`;
    this.#devMode =
      !!config.devMode && (typeof location === "undefined" || !location.search.includes("directdev=true"));
    this.#batchWindowMs = config.batchWindowMs ?? 50;

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

    // instantly fetch the initial primer package
    this.#predictivePrimer();

    // subscribe a global listener to handle lifecycle events
    document.addEventListener("visibilitychange", this.#handleVisibilityChange);
    window.addEventListener("pagehide", this.#sendBeacon);
  }

  /**
   * performs one or more requests, dispatching them towards the relevant
   * upstream nodes depending on input and configurations.
   */
  async fetch(req: FetchInput): Promise<FetchOutput>;
  async fetch(req: FetchInput[]): Promise<FetchOutput[]>;
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
      for await (const response of this.#fetchFromProviders([req], deriveProviderFromRequest(req))) {
        if (!isRpcSuccessResponse(response) && !isRpcErrorResponse(response)) {
          throw new Error("DirectRPCClient.fetch: received invalid response structure");
        }

        return response;
      }

      this.#logger.error("fetch", "no response received for request", req);
      throw new Error("DirectRPCClient.fetch: no response received for request");
    }

    //
    // STEP: otherwise run the request(s) through the Direct.dev processing
    // pipeline
    //
    try {
      if (!Array.isArray(req)) {
        return this.#fetch(req);
      } else {
        return Promise.all(req.map((it) => this.#fetch(it)));
      }
    } finally {
      if (this.#batchWindowMs < 0) {
        // if batching has been disabled, then dispatch the requests immediately
        this.#dispatchBatch();
      } else if (this.#nextBatchTimeout === undefined) {
        // ... otherwise set a timeout, which will dispatch batched requests
        // after the defined delay/window
        this.#nextBatchTimeout = window.setTimeout(this.#dispatchBatch, this.#batchWindowMs);
      }
    }
  }

  /**
   * handles the request, either by delivering a response from in-memory cache
   * or by adding it to the next batch of requests that will be dispatched
   * shortly.
   */
  async #fetch(req: FetchInput): Promise<FetchOutput> {
    if (!isRpcRequest(req)) {
      throw new Error("DirectRPCClient.#fetch(): invalid input provided, must conform to jsonrpc spec.");
    }

    if (this.#isDestroyed) {
      throw new Error("DirectRPCClient.#fetch(): called after destroying the client instance.");
    }

    return (
      (async () => {
        const reqHash = await hashRPCRequest(req);
        const cacheEntry = this.#requestCache.get(reqHash);

        // if the request has been previously cached, determine if it is still
        // fresh and return directly from there
        if (cacheEntry) {
          const now = new Date();

          const expiredByTimeToLive = cacheEntry.expiration.expiresAt && cacheEntry.expiration.expiresAt < now;
          const expiredByBlockHeight =
            cacheEntry.expiration.whenBlockHeightChanges &&
            (cacheEntry.inception.blockHeight !== this.#currentBlockHeight?.value ||
              this.#currentBlockHeight.expiresAt < now);

          if (!expiredByTimeToLive && !expiredByBlockHeight) {
            return cacheEntry.value;
          } else {
            this.#requestCache.delete(reqHash);
          }
        }

        // if the request is already inflight, then re-use existing promise
        // and simply re-wrap the response with the expected ID
        const inflightPromise = this.#inflightCache.get(reqHash);

        if (inflightPromise) {
          this.#cacheHits.push(req);

          return inflightPromise;
        }

        // ... if we get here, this is a unique request - create an inflight
        // promise for it, and push it to the next batch
        const promise = makeDeferred<DirectRPCSuccessResponse | DirectRPCErrorResponse>();

        this.#inflightCache.set(reqHash, promise);
        this.#nextBatch.set(reqHash, req);

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

    this.#logger.debug("DirectRPCClient.#predictivePrimer", "requesting primer package for most popular requests");
    this.#fetch({
      jsonrpc: "2.0",
      id: 1,
      method: "direct_primer",
      params: [normalizeContextFromUrl(window.location.href)],
    });
  }

  /**
   * dispatch pending requests in a singular batch, and resolve inflight
   * promises as soon as possible
   */
  #dispatchBatch = async () => {
    // stop any pending timers to dispatch a new request
    window.clearTimeout(this.#nextBatchTimeout);
    this.#nextBatchTimeout = undefined;

    // hold back subsequent batches while we're waiting for a head from Direct
    if (this.#isDirectHeadPending) {
      this.#logger.debug("DirectRPCClient.#dispatchBatch", "waiting for previous request head to be fetched");
      this.#nextBatchTimeout = -Infinity;
      return;
    }

    try {
      // grab reference to all pending batches
      const batchEntries = Array.from(this.#nextBatch.entries());
      this.#nextBatch.clear();

      // if the current block height is no longer guaranteed to be valid, then
      // re-fetch primer package
      //
      // (this is only a temporary meassure, until we are ready to implement
      // predictive prefetching for real)
      if (!this.#currentBlockHeight || this.#currentBlockHeight.expiresAt < new Date()) {
        if (!batchEntries.some(([, req]) => req.method === "direct_primer")) {
          const primerReq = {
            id: 0,
            method: "direct_primer",
            params: [normalizeContextFromUrl(window.location.href)],
          };

          batchEntries.push([await hashRPCRequest(primerReq), primerReq]);
        }
      }

      // re-map ids on requests, so that they're equal to the index of the
      // request in the batch list (this is useful when receiving responses as
      // it allows us to quickly identify the associated request hash and
      // resolve the correct inflight promise)
      const requests = batchEntries.map(([, req], index) => ({
        ...req,
        id: index + 1,
      }));

      const requestHashes = batchEntries.map(([reqHash]) => reqHash);
      const promises = requestHashes.map((reqHash) => this.#inflightCache.get(reqHash));
      const remainingPromises = new Set(promises);

      // perform request to upstream, and handle responses by resolving batched
      // entries
      const backoffMode = this.#backoffMode["direct.dev"];
      const iterator =
        !backoffMode || backoffMode.endsAt <= Date.now()
          ? this.#fetchFromDirect(requests)
          : this.#fetchFromProviders(requests);

      for await (const response of iterator) {
        // if we're waiting for the head of a response, then parse it as such
        if (this.#isDirectHeadPending) {
          if (!isDirectRPCHead(response)) {
            throw new Error("DirectRPCClient: invalid response structure received, expected head");
          }

          this.#isDirectHeadPending = false;

          if (this.#nextBatchTimeout === -Infinity) {
            // if the next batch should already have been dispatched, then do so
            // right away
            this.#logger.debug("DirectRPCClient.#dispatchBatch", "head received, dispatching next batch immediately");
            this.#dispatchBatch();
          }

          // for all incoming predictions, instantly register them as being
          // inflight to prevent duplication on future events
          for (const predictedReqHash of response.p) {
            const promise = makeDeferred<DirectRPCSuccessResponse | DirectRPCErrorResponse>();

            // update internal state to reflect the predicted request
            requestHashes.push(predictedReqHash);
            promises.push(promise);
            remainingPromises.add(promise);

            // create inflight cache for the predicted request, to avoid
            // duplication in subsequent fetches
            this.#inflightCache.set(predictedReqHash, promise);
          }

          // update currently known block height
          this.#currentBlockHeight =
            response.b && response.e
              ? {
                  value: response.b,
                  expiresAt: new Date(response.e),
                }
              : undefined;

          continue;
        }

        // ... otherwise parse the response, resolve external promises and apply
        // to cache if relevant
        if (!isRpcSuccessResponse(response) && !isRpcErrorResponse(response)) {
          throw new Error("DirectRPCClient.#dispatchBatch: received invalid response structure");
        }

        const reqHash = requestHashes[+response.id - 1];
        const promise = promises[+response.id - 1];

        if (!reqHash) {
          this.#logger.error(
            "DirectRPCClient.#dispatchBatch",
            `could not map response ID '${response.id}' to request hash, unable to resolve response`,
          );
          continue;
        }

        promise?.__resolve(response);
        remainingPromises.delete(promise);
        this.#inflightCache.delete(reqHash);

        if (reqHash && ("b" in response || "e" in response) && this.#currentBlockHeight) {
          this.#requestCache.set(reqHash, {
            value: response,
            expiration: {
              whenBlockHeightChanges: response.b ?? false,
              expiresAt: response.e ? new Date(response.e) : undefined,
            },
            inception: {
              blockHeight: this.#currentBlockHeight.value,
            },
          });
        }
      }

      // after having received all responses, iterate through any missing
      // promises and ensure that they are provided with a response
      for (const promise of remainingPromises) {
        promise?.__resolve({
          id: -1,
          error: {
            code: 85000,
            message: "no response received for request (Direct.dev)",
          },
        });
      }
    } finally {
      // in case of errors, allow continued operations for subsequent batches
      this.#isDirectHeadPending = false;

      if (this.#nextBatchTimeout === -Infinity) {
        // if the next batch should already have been dispatched, then do so
        // right away
        this.#logger.debug("DirectRPCClient.#dispatchBatch", "unexpected error, dispatching next batch immediately");
        this.#dispatchBatch();
      }
    }
  };

  /**
   * perform RPC requests against the Direct.dev infrastructure layer
   */
  async *#fetchFromDirect(requests: DirectRPCRequest[]): AsyncGenerator<unknown> {
    this.#isDirectHeadPending = true;

    // submit request to the Direct.dev layer for further processing
    const samples = this.#cacheHits.splice(0);
    const req = await fetch(this.#directUrl, {
      method: "POST",
      body: JSON.stringify({
        r: requests,
        s: samples,
      }),
    });

    // something went wrong in the Direct.dev layer, restore state and perform
    // fail-over
    if (!req.ok || !req.body) {
      this.#logger.error(
        "#fetchFromDirect",
        "internal server error occurred (%s %s):\n\n%s",
        req.status,
        req.statusText,
        await req.text(),
      );

      const now = Date.now();

      // restore in-memory copy of local cache hits, as we were unable to
      // sample them in the backend layer
      this.#cacheHits.splice(0, 0, ...samples);

      // register the error internally, so we can perform exponential backoff
      // if we're not already in a backoff-period
      const backoffMode = this.#backoffMode["direct.dev"];

      if (!backoffMode || backoffMode.endsAt < now) {
        const prevFailureCount = backoffMode?.failureCount ?? 0;

        this.#backoffMode["direct.dev"] = {
          failureCount: prevFailureCount + 1,
          endsAt: now + 2 ** Math.min(8, prevFailureCount) * BASE_BACKOFF_DURATION_MS,
        };

        this.#logger.debug(
          "DirectRPCClient.#fetchFromDirect",
          "backing off until",
          new Date(this.#backoffMode["direct.dev"].endsAt),
        );
      }

      // retry the same requests in failover-mode to guarantee
      this.#logger.debug("DirectRPCClient.#fetchFromDirect", "retrying failed requests from providers", requests);

      this.#isDirectHeadPending = false;
      return this.#fetchFromProviders(requests);
    }

    // if we get here, things went OK, reset any previous backoff data and
    // continue operations as usual through the Direct.dev infrastructure
    this.#backoffMode["direct.dev"] = undefined;

    // transform the response body into an AsyncGenerator which emits a
    // response for every line returned by the Direct.dev infrastructure
    const iterator = makeGeneratorFromNDJsonResponse(req.body);

    for await (const item of iterator) {
      yield item;
    }
  }

  /**
   * fail-over mechanism to perform requests directly against the designated
   * provider nodes
   */
  #fetchFromProviders(requests: DirectRPCRequest[], providerId?: SupportedProviderId): AsyncGenerator<unknown> {
    const chunks = chunkArray(requests, BATCH_MAX_SIZE);

    return makeAsyncGeneratorFromEmitter(async (emit) => {
      await Promise.allSettled(
        chunks.map(async (chunk) => {
          const res = await this.#fetchChunkFromProviders(chunk, providerId);

          for (const item of res) {
            emit(item);
          }
        }),
      );
    });
  }

  /**
   * internal helper that performs fetching of responses for a chunk of
   * requests; also handles exponential node backoff and fail-over on requests
   */
  async #fetchChunkFromProviders(
    chunk: DirectRPCRequest[],
    providerId: SupportedProviderId | undefined,
    failoverMode = false,
  ): Promise<unknown[]> {
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
        throw new Error("DirectRPCClient.#fetchFromProviders: unknown server error occurred");
      }

      // yield responses through the AsyncGenerator interface
      const res = await req.json();

      if (!Array.isArray(res)) {
        throw new Error("DirectRPCClient.#fetchFromProviders: invalid response received, expected array");
      }

      // if we get here, things went OK, reset any previous backoff data and
      // continue operations as usual through the Direct.dev infrastructure
      this.#backoffMode[node.url] = undefined;

      return res;
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
  #sendBeacon = () => {
    if (this.#cacheHits.length === 0) {
      return;
    }

    navigator.sendBeacon(
      this.#directUrl,
      JSON.stringify({
        r: [],
        s: this.#cacheHits.splice(0),
      }),
    );
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
    window.clearTimeout(this.#nextBatchTimeout);
  }
}
