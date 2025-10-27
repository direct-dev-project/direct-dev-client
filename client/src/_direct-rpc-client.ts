import type { LogLevel } from "@direct.dev/shared";
import {
  generateRandomId,
  isBlockHeightAhead,
  isRecord,
  iterateBlockSpan,
  mapMaybePromise,
  readFromSessionStorage,
  sortObject,
  writeToSessionStorage,
} from "@direct.dev/shared";

import { DEFAULT_FAILOVER } from "./constants.js";
import { DirectBlockHeightManager } from "./core.block-height.js";
import { DirectCacheManager } from "./core.cache.js";
import { DirectClockManager } from "./core.clock.js";
import { DirectRequestRouter } from "./core.request.js";
import { DirectSyncManager } from "./core.sync.js";
import { DirectTelemetryManager } from "./core.telemetry.js";
import { configSchema } from "./schemas.js";

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
  projectToken?: string | null;

  /**
   * Override the baseUrl used when connecting to Direct infrastructure, useful
   * especially when running a local testing environment.
   *
   * @default "https://rpc.direct.dev"
   */
  baseUrl?: string | null;

  /**
   * Specifies the verbosity of logging from the DirectClient
   *
   * @default "info"
   */
  logLevel?: LogLevel | null;

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
  devMode?: boolean | null;

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
  batchWindowMs?: number | null;

  /**
   * Configures the format used when transmitting JSON-RPC requests from client
   * to Direct.dev infrastructure
   *
   * This setting exists only to improve Developer Experience, and should only
   * be used in local development environments. Using anything other than
   * "wire" will negatively impact performance in production environments.
   *
   * @default "wire"
   */
  preferredFormat?: "wire" | "ndjson" | "jsonrpc" | null;

  /**
   * Allows disabling of WebSocket-based state synchronization between client
   * and Direct.dev infrastructure.
   *
   * Developers can use this setting to closely mimic vanilla JSON-RPC while
   * testing during local development. Additionally it can be used in
   * environments that inherently do not support WebSocket based connections
   * (e.g. certain edge runtimes).
   *
   * It is, however, strongly recommended to leave state synchronization on
   * when deploying to production. This will allow Direct.dev to deliver most
   * requests with zero-latency in the client layer, while additionally
   * enabling near-zero overhead on cache misses.
   *
   * @default false
   */
  disableSync?: boolean | null;

  /**
   * Collection of upstream data provider URLs; we utilize these providers in
   * case of downtime on Direct.dev to provide automatic fail-over directly to
   * your own provider nodes.
   */
  failover?: string[] | null;

  /**
   * Enable network inspection, prompting the Direct.dev client to trigger faux
   * requests for RPC cache hits and sync events.
   */
  networkInspect?: boolean | null;
};

type FetchInput = DirectRPCRequest & { jsonrpc: string };
type FetchOutput = DirectRPCResultResponse | DirectRPCErrorResponse;

/**
 * Core client used to perform RPC requests from client to the Direct.dev
 * infrastructure
 */
export class DirectRPCClient {
  #blockHeightManager: DirectBlockHeightManager;
  #cacheManager: DirectCacheManager;
  #clockManager: DirectClockManager;
  #requestRouter: DirectRequestRouter;
  #syncManager: DirectSyncManager | undefined;
  #telemetryManager: DirectTelemetryManager;

  /**
   * specifies the URL which should be used when connecting to Direct.dev
   */
  readonly endpointUrl: string;

  /**
   * specifies if client should bypass Direct.dev infrastructure, as it is
   * currently in development mode.
   */
  readonly devMode: boolean;

  /**
   * set of listeners currently subscribed to block height events
   */
  readonly #onBlockHeightHandlers = new Set<(blockHeight: RPCBlockHeight, expiresAt: Date) => void>();

  constructor(rawConfig: DirectRPCClientConfig, TelemetryManager = DirectTelemetryManager) {
    const config = configSchema(rawConfig);

    // warn if one or more invalid config properties have been provided
    const configKeys = Object.keys(config);
    const rawConfigKeys = Object.keys(rawConfig);

    if (configKeys.length !== rawConfigKeys.length) {
      const invalidConfigKeys = rawConfigKeys.filter((it) => !configKeys.includes(it));

      if (invalidConfigKeys.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[direct.dev] invalid config props provided: ${invalidConfigKeys.join(", ")}`);
      }
    }

    // generate a persistent session ID for this project, so we can analyze
    // access patterns across networks in Direct.dev infrastructure
    const sessionIdKey = `sessionId:${config.projectId}`;
    const sessionId = readFromSessionStorage(sessionIdKey) ?? generateRandomId();
    writeToSessionStorage(sessionIdKey, sessionId);

    // build internal settings from supplied configurations
    this.endpointUrl = `${config.baseUrl ?? "https://rpc.direct.dev"}/v1/${encodeURIComponent(config.projectToken ? config.projectId + "." + config.projectToken : config.projectId)}/${encodeURIComponent(config.networkId)}`;
    this.devMode = !!config.devMode && (typeof location === "undefined" || !location.search.includes("directdev=true"));

    //
    // STEP: initialize managers
    //
    this.#clockManager = new DirectClockManager();
    this.#blockHeightManager = new DirectBlockHeightManager(this.#clockManager, (blockHeight, expiresAt) => {
      this.#onBlockHeightHandlers.forEach((cb) => {
        cb(blockHeight, expiresAt);
      });
    });
    this.#cacheManager = new DirectCacheManager(this.#clockManager);

    this.#telemetryManager = new TelemetryManager({
      projectId: config.projectId,
      networkId: config.networkId,
      logLevel: config.logLevel ?? "info",
      endpointUrl: this.endpointUrl + "/pulse?" + new URLSearchParams({ sessionId }),
      preferredFormat: config.preferredFormat,
    });

    if (!this.devMode && !config.disableSync) {
      // only create sync manager if enabled for the current environment
      this.#syncManager = new DirectSyncManager(
        {
          logLevel: config.logLevel ?? "info",
          networkInspect: config.networkInspect ?? false,
          projectId: config.projectId,
          networkId: config.networkId,
          sessionId,
          endpointUrl: this.endpointUrl + "/sync",
          preferredFormat: (() => {
            switch (config.preferredFormat) {
              case "jsonrpc":
              case "ndjson":
                return "ndjson";

              default:
                return "wire";
            }
          })(),
        },
        this.#blockHeightManager,
        this.#cacheManager,
        this.#clockManager,
        this.#telemetryManager,
      );
    }

    this.#requestRouter = new DirectRequestRouter(
      {
        logLevel: config.logLevel ?? "info",
        networkInspect: config.networkInspect ?? false,
        projectId: config.projectId,
        networkId: config.networkId,
        sessionId,

        devMode: this.devMode,
        endpointUrl: this.endpointUrl,
        providerNodes: config.failover ?? DEFAULT_FAILOVER[config.networkId],

        preferredFormat: config.preferredFormat ?? "wire",
        batchWindowMs: config.batchWindowMs ?? 25,
        isHttps: false,
      },
      this.#blockHeightManager,
      this.#cacheManager,
      this.#syncManager,
      this.#telemetryManager,
    );

    this.#bootstrap();
  }

  /**
   * bootstrap the client, binding relevant lifecycle events and loading data
   * from persistent storage into memory
   */
  async #bootstrap(): Promise<void> {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.#handleVisibilityChange);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.#handleBeforeUnload);
    }

    this.#telemetryManager.restoreCriticalTelemetry();
    await this.#syncManager?.restoreState();
    await this.#syncManager?.start();
  }

  /**
   * performs one or more requests, dispatching them towards the relevant
   * upstream nodes depending on input and configurations.
   */
  fetch(req: FetchInput): MaybePromise<FetchOutput>;
  fetch(req: FetchInput[]): MaybePromise<FetchOutput[]>;
  fetch(req: MaybeArray<FetchInput>): MaybePromise<MaybeArray<FetchOutput>>;
  fetch(req: MaybeArray<FetchInput>): MaybePromise<MaybeArray<FetchOutput>> {
    // restart syncing if it's been paused due to periods of inactivity
    this.#syncManager?.start(true);

    const res = this.#requestRouter.fetch(req);

    try {
      return res;
    } finally {
      this.#handleResponses(req, res);
    }
  }

  /**
   * handle side effects of requests, to ensure that internal client state is
   * correctly updated in response to special edge cases.
   */
  async #handleResponses(_reqs: MaybeArray<FetchInput>, _res: MaybePromise<MaybeArray<FetchOutput>>): Promise<void> {
    const reqs = Array.isArray(_reqs) ? _reqs : [_reqs];
    const responses = await mapMaybePromise(_res, (res) => (Array.isArray(res) ? res : [res]));

    // map all requests based on id
    const reqsById = new Map(reqs.map((it) => [it.id, it]));

    // iterate over all responses, and handle side effects
    for (const res of responses) {
      const req = reqsById.get(res.id);

      switch (req?.method) {
        // getTransactionReceipt must lock minimum block height to that of the
        // retrieved transaction receipt, ensuring that subsequent requests will
        // deliver results including transaction result
        case "eth_getTransactionReceipt":
        case "direct_getTransactionReceipt":
          if (
            "result" in res &&
            isRecord(res.result) &&
            typeof res.result["blockNumber"] === "string" &&
            res.result["blockNumber"].startsWith("0x")
          ) {
            this.#blockHeightManager.setMinimum(res.result["blockNumber"] as RPCBlockHeight);
          }
      }
    }
  }

  /**
   * get current block height (if known)
   */
  getBlockHeight(): RPCBlockHeight | undefined {
    return this.#blockHeightManager.getCurrent();
  }

  /**
   * subscribe a callback to block height changes
   */
  watchBlockHeight(
    callback: (blockHeight: RPCBlockHeight, prevBlockHeight: RPCBlockHeight | undefined) => void,
    options?: {
      emitMissed?: boolean;
      emitOnBegin?: boolean;
      pollingIntervalMs?: number;
      onError?: (err: unknown) => void;
    },
  ): () => void {
    let prevBlockHeight: RPCBlockHeight | undefined;
    let pollTimeout: NodeJS.Timeout | number | undefined;
    const pollIntervalMs = options?.pollingIntervalMs ?? 3_000;

    // create a callback which handles new block heights, emitting them
    // externally and scheduling fetching of new block height in the desired
    // interval
    const handleBlockHeight = (blockHeight: RPCBlockHeight) => {
      if (prevBlockHeight != null && isBlockHeightAhead(blockHeight, prevBlockHeight) === false) {
        // ignore scenario where new block height is behind previously
        // emitted value
        return;
      }

      clearTimeout(pollTimeout);

      try {
        if (prevBlockHeight != null && options?.emitMissed) {
          // if emitMissed is enabled, then iterate and yield all blocks
          // between previous and current one
          for (const missedBlockHeight of iterateBlockSpan(prevBlockHeight, blockHeight)) {
            callback(missedBlockHeight, prevBlockHeight);
            prevBlockHeight = missedBlockHeight;
          }
        } else {
          // ... otherwise simply yield the received block height
          callback(blockHeight, prevBlockHeight);
        }

        prevBlockHeight = blockHeight;
      } finally {
        pollTimeout = setTimeout(() => pollForBlockHeight(), pollIntervalMs);
      }
    };

    // create a callback which polls for current block height from remote
    // source (which will be triggered in the given interval, unless Direct Sync
    // manages to deliver results faster)
    const pollForBlockHeight = async () => {
      try {
        const response = await this.#requestRouter.fetch({
          id: 1,
          method: "eth_blockNumber",
          params: [],
          jsonrpc: "2.0",
        });

        if ("error" in response) {
          throw new Error("DirectRPCClient.watchBlockHeight: " + response.error.message);
        }

        handleBlockHeight(String(response.result) as RPCBlockHeight);
      } catch (err) {
        options?.onError?.(err);
      }
    };

    // subscribe callback to active listeners within the block height manager
    this.#onBlockHeightHandlers.add(handleBlockHeight);

    if (options?.emitOnBegin) {
      // if we need to emit block height initially, then do so right away if
      // it's already known
      const blockHeight = this.#blockHeightManager.getCurrent();

      if (blockHeight != null) {
        handleBlockHeight(blockHeight);
      } else {
        pollForBlockHeight();
      }
    } else {
      // ... otherwise if we're not emitting initially, then setup first
      // polling interval
      pollTimeout = setTimeout(() => pollForBlockHeight(), pollIntervalMs);
    }

    // return a disconnect callback, which allows unsubscribing the callback
    // from watching of block heights
    return () => {
      this.#onBlockHeightHandlers.delete(handleBlockHeight);
      clearTimeout(pollTimeout);
    };
  }

  /**
   * handle the "visibility change" event, which allows us to:
   *
   * - flush telemetry and disable state syncing when page is backgrounded
   * - resume state syncing when page is activated again
   */
  #handleVisibilityChange = () => {
    if (typeof document === "undefined") {
      return;
    }

    switch (document.visibilityState) {
      case "hidden":
        // flush telemetry data when user leaves the site
        this.#telemetryManager.flushData(true);
        return;
    }
  };

  /**
   * handle before unload event to attempt sending any still pending telemetry
   * data to Direct.dev infrastructure.
   */
  #handleBeforeUnload = () => {
    this.#telemetryManager.flushData(true);
    this.#telemetryManager.persistCriticalTelemetry();
    this.#syncManager?.persistState();
  };

  /**
   * destroy all nested managers associated with this client, ensuring that
   * memory is freed up fully.
   */
  destroy() {
    this.#onBlockHeightHandlers.clear();

    this.#requestRouter.destroy();
    this.#cacheManager.destroy();
    this.#syncManager?.destroy();

    // importantly destroy telemetry manager AFTER other managers, to ensure
    // that potential final data segments are collected prior to flushing
    this.#telemetryManager.destroy();
  }
}

/**
 * Instantiate shared RPC clients, to ensure session-sharing in environments
 * with multiple active clients on the same network (e.g. projects partially
 * migrated from one client library to another).
 */
export function makeDirectRPCClient(config: DirectRPCClientConfig): DirectRPCClient {
  const configHash = sortObject(config);

  if (!clientCache.has(configHash)) {
    clientCache.set(configHash, new DirectRPCClient(config));
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return clientCache.get(configHash)!;
}

const clientCache = new Map<string, DirectRPCClient>();
