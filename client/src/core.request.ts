import type { LogLevel } from "@direct.dev/shared";
import { DirectBackoffManager, estimateJsonRpcSize, inferRequestHashFromCacheKey, Logger } from "@direct.dev/shared";

import { DirectRPCBatchManager } from "./batch._manager.js";
import type { BatchConfig } from "./batch.core.js";
import { AVG_HTTP_REQUEST_HEADER_SIZE, AVG_HTTP_RESPONSE_HEADER_SIZE, AVG_GZIP_COMPRESSION } from "./constants.js";
import type { DirectBlockHeightManager } from "./core.block-height.js";
import type { DirectCacheManager } from "./core.cache.js";
import type { DirectSyncManager } from "./core.sync.js";
import type { DirectTelemetryManager } from "./core.telemetry.js";
import { rpcRequestSchema, rpcResponseSchema } from "./schemas.js";

type Config = Omit<BatchConfig, "blockHeight"> & {
  logLevel: LogLevel;
  networkInspect: boolean;
  projectId: string;
  networkId: SupportedNetworkId;
  devMode: boolean;
  batchWindowMs: number;
  providerNodes: string[];
};

type FetchInput = DirectRPCRequest & { jsonrpc: string };
type FetchOutput = DirectRPCResultResponse | DirectRPCErrorResponse;
export class DirectRequestRouter {
  #config: Config;
  #logger: Logger;

  #backoffManager: DirectBackoffManager;
  #blockHeightManager: DirectBlockHeightManager;
  #cacheManager: DirectCacheManager;
  #syncManager: DirectSyncManager | undefined;
  #telemetryManager: DirectTelemetryManager;

  #isDestroyed = false;

  /**
   * reference to the currently open batch, so that requests can be pushed onto
   * it until the time of it's submission.
   */
  #batchManager: DirectRPCBatchManager | undefined;

  /**
   * duration during which we'll send requests through existing batch stream
   */
  #batchWindowMs: number;

  /**
   * reference to the timeout which will trigger dispatching of the current
   * batch, allowing opening of a new one as soon as it becomes possible
   */
  #batchTimeout: NodeJS.Timeout | number | undefined;

  /**
   * collection of recent cache hits, used in case of network inspection to
   * create faux fetch requests.
   */
  #cacheHits: Array<{ req: DirectRPCRequest; res: DirectRPCResultResponse | DirectRPCErrorResponse }> = [];

  constructor(
    config: Config,
    blockHeightManager: DirectBlockHeightManager,
    cacheManager: DirectCacheManager,
    syncManager: DirectSyncManager | undefined,
    telemetryManager: DirectTelemetryManager,
  ) {
    this.#config = config;
    this.#blockHeightManager = blockHeightManager;
    this.#cacheManager = cacheManager;
    this.#syncManager = syncManager;
    this.#telemetryManager = telemetryManager;

    this.#backoffManager = new DirectBackoffManager(
      {
        baseDurationMs: 1_000,
        cooldownMs: 10_000,
      },
      (evt) => {
        this.#telemetryManager.collectBackoffEvent({
          ...evt,
          source: evt.contextId === this.#config.endpointUrl ? "direct-rpc" : "failover",
        });
      },
    );

    this.#logger = new Logger({
      prefix: "Direct.dev: RequestRouter:",
      level: config.logLevel,
      context: {
        projectId: config.projectId,
        networkId: config.networkId,
      },
    });

    // prepare configurations for handling batches of requests
    this.#batchWindowMs = config.batchWindowMs ?? 25;

    if (this.#config.providerNodes.length === 0) {
      throw new Error(
        "new DirectRequestRouter(): you must configure at least 1 fallback provider for fail-over handling",
      );
    }
  }

  /**
   * fetch one or more requests, performing automatic routing between
   * Direct.dev infrastructure and configured upstream providers.
   */
  async fetch(req: FetchInput): Promise<FetchOutput>;
  async fetch(req: FetchInput[]): Promise<FetchOutput[]>;
  async fetch(req: MaybeArray<FetchInput>): Promise<MaybeArray<FetchOutput>>;
  async fetch(req: MaybeArray<FetchInput>): Promise<MaybeArray<FetchOutput>> {
    if (this.#isDestroyed) {
      throw new Error("DirectRequestRouter.fetchOne(): instance destroyed");
    }

    const startedAt = Date.now();
    let response: MaybePromise<Array<DirectRPCResultResponse | DirectRPCErrorResponse>> | undefined;

    try {
      //
      // STEP: in development mode, fetch data directly from upstream providers
      // in order to fully bypass Direct.dev infrastructure
      //
      if (this.#config.devMode) {
        response = await this.#fetchFromProviders(Array.isArray(req) ? req : [req], undefined);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return Array.isArray(req) ? response : response[0]!;
      }

      //
      // STEP: otherwise perform request routing, prefering Direct.dev
      // infrastructure for eligible requests
      //

      const syncPromise = this.#syncManager?.wait();

      if (syncPromise) {
        await syncPromise;
      }

      const blockHeight = this.#blockHeightManager.getCurrent();

      try {
        // run requests through internal fetcher
        const reqs = Array.isArray(req) ? req : [req];
        const output = await Promise.all(
          reqs.map(async (req) => {
            const [cacheKey, requestHash] = await this.#cacheManager.getCacheKey(req, blockHeight);
            return this.#fetch(requestHash, cacheKey, req, blockHeight);
          }),
        );

        response = Promise.all(output.map((it) => it.response));

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return Array.isArray(req) ? response : Promise.resolve(response).then((res) => res[0]!);
      } finally {
        if (this.#batchManager?.length) {
          if (this.#batchWindowMs < 0) {
            // if batching has been disabled, then dispatch the requests
            // immediately
            this.#dispatchBatch();
          } else if (this.#batchTimeout === undefined) {
            // ... otherwise, if a throttled batch is not currently pending,
            // then dispatch the current request immediately and set a timeout
            // for subsequent requests
            this.#dispatchBatch();
            this.#batchTimeout = setTimeout(() => {
              this.#dispatchBatch();
              this.#batchTimeout = undefined;
            }, this.#batchWindowMs);
          }
        }
      }
    } finally {
      // if enabled, then create faux requests for cache hits in network
      // inspector
      if (this.#config.networkInspect && this.#cacheHits.length > 0) {
        fetch("data:application/json;direct=rpc," + encodeURIComponent(JSON.stringify(this.#cacheHits)), {
          method: "POST",
        }).then((it) => it.text());

        this.#cacheHits = [];
      }

      const finalResponse = response && "then" in response ? await response : response;

      // collect response time telemetry based on duration from recieving the
      // request until response was received
      const responseTimeMs = Date.now() - startedAt;

      this.#telemetryManager.collectResponseTime(responseTimeMs);
      this.#logger.verbose("fetch", `response delivered in ${responseTimeMs.toLocaleString()}ms`, {
        req,
        res: Array.isArray(req) ? finalResponse : finalResponse?.[0],
      });

      // track estimated bandwidth usage to perform this request
      const requestBody = estimateJsonRpcSize(req);
      const responseBody = estimateJsonRpcSize(finalResponse);

      this.#telemetryManager.collectBandwidthUsage({
        type: "rpc",
        upload: requestBody + AVG_HTTP_REQUEST_HEADER_SIZE,
        download: responseBody * (1 - AVG_GZIP_COMPRESSION) + AVG_HTTP_RESPONSE_HEADER_SIZE,
      });
    }
  }

  /**
   * handles the request, either by delivering a response from in-memory cache
   * or by adding it to the next batch of requests that will be dispatched
   * shortly.
   */
  #fetch(
    requestHash: DirectRequestHash,
    cacheKey: DirectCacheKey,
    input: DirectRPCRequest & { jsonrpc: string },
    blockHeight: RPCBlockHeight | undefined,
  ): MaybePromise<{ response: MaybePromise<DirectRPCResultResponse | DirectRPCErrorResponse> }> {
    // validate incoming data structure
    const request = rpcRequestSchema(input);

    // deliver eth_blockNumber from in-memory cache if available
    if (request.method === "eth_blockNumber" && blockHeight != null) {
      const response = {
        id: request.id,
        result: blockHeight,
      };

      try {
        return { response };
      } finally {
        this.#cacheHits.push({
          req: input,
          res: { ...response, id: input.id },
        });

        this.#telemetryManager.collectCacheHit({
          cacheKey,
          blockHeight,
          request,
          response,
        });
      }
    }

    // check if the requested item is currently available directly from
    // in-memory cache
    const inMemoryResponse = this.#cacheManager.getFromMemory(cacheKey);

    if (inMemoryResponse) {
      try {
        return { response: inMemoryResponse };
      } finally {
        this.#cacheHits.push({
          req: input,
          res: { ...inMemoryResponse, id: input.id },
        });

        this.#telemetryManager.collectCacheHit({
          cacheKey,
          blockHeight,
          request,
          response: inMemoryResponse,
        });
      }
    }

    return {
      response: (async () => {
        // check if the requested item is currently available through inflight
        // mechanisms
        for (
          let inflightEntry = this.#cacheManager.getInflight(cacheKey);
          inflightEntry != null;
          inflightEntry = this.#cacheManager.getInflight(cacheKey)
        ) {
          const response = await inflightEntry;

          // if the request was matched through inflight mechanisms, then return
          // response directly
          if (response) {
            try {
              return response;
            } finally {
              this.#cacheHits.push({
                req: input,
                res: { ...response, id: input.id },
              });

              this.#telemetryManager.collectInflightHit({
                cacheKey,
                blockHeight,
                request,
                response,
              });
            }
          }
        }

        // if we get here then push the request onto current batch and track for
        // inflight uniqueness for subsequent requests
        const inflightPromise = this.#cacheManager.openInflightRequest(cacheKey);

        this.#batchManager ??= new DirectRPCBatchManager(this.#logger, this.#config, {
          blockHeight: this.#blockHeightManager.getCurrent(),
        });

        this.#batchManager.push({
          requestBody: {
            ...request,
            bypassMirror: this.#syncManager?.isActive() && !this.#syncManager.isRevalidated(requestHash),
          },
          requestKey: cacheKey,
        });

        return inflightPromise;
      })().then((response) =>
        Promise.resolve(response).then((response) => ({
          ...response,

          // add hardcoded jsonrpc: "2.0" property for data received from
          // Direct.dev infrastructure, but allow native jsonrpc property to
          // pass-through if data was fetched directly from providers
          jsonrpc: "jsonrpc" in response ? response.jsonrpc : "2.0",

          // re-wrap response ID identical to the incoming request; this is
          // necessary because we frequently re-write IDs when doing RPC
          // request batching to Direct.dev infrastructure and for data
          // delivered through in-memory or inflight cache layers
          id: request.id,
        })),
      ),
    };
  }

  /**
   * dispatch pending requests in a singular batch, and resolve inflight
   * promises as soon as possible
   */
  #dispatchBatch = async () => {
    if (!this.#batchManager) {
      // bail out if no batch exists
      return;
    }

    clearTimeout(this.#batchTimeout);
    this.#batchTimeout = undefined;

    const currBatch = this.#batchManager;
    this.#batchManager = undefined;

    // re-map ids on requests, so that they're equal to the index of the
    // request in the batch list (this is useful when receiving responses as
    // it allows us to quickly identify the associated request hash and
    // resolve the correct inflight promise)
    const requests = currBatch.requests;
    const receivedResponses = new Set<number>();

    try {
      // perform request to upstream, and handle responses by resolving
      // batched entries
      const responses =
        (await this.#fetchFromDirect(currBatch)) ??
        (await this.#fetchFromProviders(requests.map((it) => it.requestBody)));

      await this.#handleResponses(responses, (res) => {
        receivedResponses.add(+res.id);

        return requests[+res.id - 1]?.requestKey;
      });
    } catch (err) {
      const failedRequests = requests.filter((req) => !receivedResponses.has(+req.requestBody.id));

      this.#logger.warn(
        "#dispatchBatch",
        `an error occurred while fetching responses, retrying ${failedRequests.length} of ${requests.length} requests`,
        { err },
      );

      // register the error internally, so we can perform exponential
      // backoff if we're not already in a backoff-period (this can happen
      // if multiple batches cross each other)
      if (!this.#backoffManager.shouldBackOff(this.#config.endpointUrl)) {
        const backOffMs = this.#backoffManager.handleFailure(this.#config.endpointUrl);

        this.#logger.debug("#dispatchBatch", "entering back-off mode", {
          endsAt: new Date(Date.now() + backOffMs),
        });
      }

      // retry failed requests directly against provider nodes in case of
      // runtime exceptions in Direct.dev infrastructure
      const responses = await this.#fetchFromProviders(failedRequests.map((it) => it.requestBody));

      await this.#handleResponses(responses, (res) => {
        receivedResponses.add(+res.id);

        return requests[+res.id - 1]?.requestKey;
      });
    } finally {
      // perform response guarantee to ensure that all requests receive a
      // response regardless of upstream errors
      for (const req of requests) {
        if (receivedResponses.has(+req.requestBody.id)) {
          continue;
        }

        this.#cacheManager.handleResponse(
          {
            id: req.requestBody.id,
            error: {
              code: 85002,
              message: "failed to receive response (Direct.dev)",
            },
          },
          req.requestKey,
        );
      }
    }
  };

  /**
   * iterate through responses and resolve internal promises, ensuring that
   * external callers receive the values correctly.
   */
  async #handleResponses(
    responses:
      | AsyncGenerator<
          | { type: "head"; value: DirectRPCHead }
          | { type: "item"; value: DirectRPCResultResponse | DirectRPCErrorResponse }
          | { type: "tail"; value: { upload: number; download: number } }
        >
      | Array<DirectRPCResultResponse | DirectRPCErrorResponse>,
    getResponseKey: (response: DirectRPCResultResponse | DirectRPCErrorResponse) => DirectCacheKey | undefined,
  ) {
    let blockHeight: RPCBlockHeight | undefined;

    const iterator = Array.isArray(responses)
      ? (async function* emit() {
          for (const value of responses) {
            yield { type: "item" as const, value };
          }
        })()
      : responses;

    for await (const segment of iterator) {
      if (this.#isDestroyed) {
        // silently ignore returned data when client has been destroyed
        continue;
      }

      // if we're waiting for the head of a response, then parse it as such
      if (segment.type === "head") {
        const head = segment.value;

        // update currently known block height
        if (head.blockHeight && head.blockHeightExpiresAt) {
          blockHeight = head.blockHeight;
          this.#blockHeightManager.setCurrent(head.blockHeight, head.blockHeightExpiresAt);
        }
        continue;
      }

      // if we received a tail, update aggregated bandwidth usage
      if (segment.type === "tail") {
        this.#telemetryManager.collectBandwidthUsage({
          type: "http",
          download: segment.value.download + AVG_HTTP_REQUEST_HEADER_SIZE,
          upload: segment.value.upload + AVG_HTTP_RESPONSE_HEADER_SIZE,
        });
        continue;
      }

      // ... otherwise parse the response, and apply to in-memory cache
      // layer if eligible
      const response = segment.value;
      const cacheKey = getResponseKey(response);

      if (!cacheKey) {
        this.#logger.error(
          "#dispatchBatch",
          `could not map response ID '${response.id}' to request key, unable to resolve response`,
          {
            response,
          },
        );
        continue;
      }

      if ("error" in response) {
        if (response.error.code >= 80000 && response.error.code <= 85999) {
          // if a Direct.dev proprietary error code was received, then register
          // it for subsequent exponential backoff
          this.#backoffManager.handleFailure(this.#config.endpointUrl + "/" + response.error.code);
        }
      }

      // resolve any pending inflight promise
      const responseHash = await this.#cacheManager.handleResponse(response, cacheKey);

      if ("result" in response && response.expiresAt) {
        // cache request in-memory if it is applicable for re-use later
        this.#cacheManager.mapRequestToResponse(
          blockHeight,
          inferRequestHashFromCacheKey(cacheKey),
          responseHash,
          response.expiresAt,
        );
      }
    }
  }

  /**
   * perform RPC requests against the Direct.dev infrastructure layer
   */
  async #fetchFromDirect(
    batchManager: DirectRPCBatchManager,
  ): Promise<
    | AsyncGenerator<
        | { type: "head"; value: DirectRPCHead }
        | { type: "item"; value: DirectRPCResultResponse | DirectRPCErrorResponse }
        | { type: "tail"; value: { upload: number; download: number } }
      >
    | undefined
  > {
    if (this.#backoffManager.shouldBackOff(this.#config.endpointUrl + "/*")) {
      return;
    }

    // dispatch request including metrics data to the Direct.dev layer for
    // further processing
    const response = await batchManager.dispatch();

    if (response) {
      // if things went OK, then reset any previously known backoff-settings
      // and continue operations as usual from here
      this.#backoffManager.resetStatus(this.#config.endpointUrl);

      return response;
    }

    // register the error internally, so we can perform exponential backoff
    // if we're not already in a backoff-period (this can happen if multiple
    // batches cross each other)
    if (!this.#backoffManager.shouldBackOff(this.#config.endpointUrl)) {
      const backOffMs = this.#backoffManager.handleFailure(this.#config.endpointUrl);

      this.#logger.debug("#fetchFromDirect", "entering back-off mode", {
        endsAt: new Date(Date.now() + backOffMs),
      });
    }
  }

  /**
   * internal helper that performs fetching of responses for a chunk of
   * requests; also handles exponential node backoff and fail-over on requests
   */
  async #fetchFromProviders(
    requests: DirectRPCRequest[],
    failoverMode = false,
  ): Promise<Array<DirectRPCResultResponse | DirectRPCErrorResponse>> {
    const availableNodes = (() => {
      const activeNodes = this.#config.providerNodes.filter((it) => {
        return !this.#backoffManager.shouldBackOff(it);
      });

      return activeNodes.length > 0 ? activeNodes : this.#config.providerNodes;
    })();

    const nodeUrl =
      !failoverMode || availableNodes.length < 2
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          availableNodes[0]!
        : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          availableNodes[1 + Math.floor(Math.random() * (this.#config.providerNodes.length - 1))]!;

    try {
      //
      // STEP: rewrite any direct_* proprietary calls to their public eth_*
      // counterparts
      //
      const reqs = requests.map((req) => {
        switch (req.method) {
          case "direct_getTransactionReceipt":
            return {
              id: req.id,
              method: "eth_getTransactionReceipt",
              params: Array.isArray(req.params) ? req.params.slice(0, 1) : [""],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              jsonrpc: (req as any).jsonrpc ?? "2.0",
            };

          default:
            return {
              id: req.id,
              method: req.method,
              params: req.params,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              jsonrpc: (req as any).jsonrpc ?? "2.0",
            };
        }
      });

      //
      // STEP: perform the request, ensure response correctness and return for
      // further processing in parent function
      //
      const reqBody = JSON.stringify(reqs);
      const req = await fetch(nodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: reqBody,
      });

      // track used bandwidth
      if (!req.ok) {
        throw new Error("#fetchChunkFromProviders: unknown server error occurred");
      }

      // track used bandwidth
      const resText = await req.text();
      this.#telemetryManager.collectBandwidthUsage({
        type: "http",
        upload: reqBody.length + AVG_HTTP_REQUEST_HEADER_SIZE,
        download: resText.length * (1 - AVG_GZIP_COMPRESSION) + AVG_HTTP_RESPONSE_HEADER_SIZE,
      });

      // validate the structure of the responses
      const res = JSON.parse(resText);
      const responses = (Array.isArray(res) ? res : [res]).map((it) => rpcResponseSchema(it));

      // if we get here, things went OK, reset any previous backoff data and
      // continue operations as usual through the Direct.dev infrastructure
      this.#backoffManager.resetStatus(nodeUrl);

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
      if (!this.#backoffManager.shouldBackOff(nodeUrl)) {
        const backOffMs = this.#backoffManager.handleFailure(nodeUrl);

        this.#logger.debug("#fetchChunkFromProviders", "entering back-off mode", {
          endsAt: new Date(Date.now() + backOffMs),
          node: nodeUrl,
        });
      }

      // retry the request, routing it through one of the other supplied
      // provider nodes
      return this.#fetchFromProviders(requests, true);
    }
  }

  /**
   * destroy the instance, ensuring that any currently pending batches are
   * correctly reset
   */
  destroy() {
    this.#isDestroyed = true;

    clearTimeout(this.#batchTimeout);
    this.#batchTimeout = undefined;
    this.#batchManager = undefined;
  }
}
