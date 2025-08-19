import type { LogLevel } from "@direct.dev/shared";
import {
  deleteFromLocalStorage,
  getBlockHeightParam,
  inferRequestHashFromCacheKey,
  Logger,
  mayRPCRequestRevalidate,
  mayRPCRequestSync,
  normalizeRPCMethod,
  readFromLocalStorage,
  writeToLocalStorage,
} from "@direct.dev/shared";
import { wire, WIRE_VERSION_ID } from "@direct.dev/wire";

import type { DirectRPCClientConfig } from "./_direct-rpc-client.js";
import { persistedTelemetrySchema } from "./schemas.js";

type Config = {
  projectId: string;
  networkId: SupportedNetworkId;
  logLevel: LogLevel;
  endpointUrl: string;
  preferredFormat: DirectRPCClientConfig["preferredFormat"];
};

type CacheHitParams = {
  cacheKey: DirectCacheKey;
  blockHeight: RPCBlockHeight | undefined;
  request: DirectRPCRequest;
  response: DirectRPCResultResponse | DirectRPCErrorResponse;
};

export type PersistedTelemetry = {
  backoffEvents: BackoffEvent[];
};

/**
 * raw estimate of the basic telemetry JSON structure, used to bootstrap size
 * estimates when consuming current data.
 */
const BASE_TELEMETRY_JSON_IN_BYTES = 225;

/**
 * configuration of the maximum allowed beacon payload size, used to ensure that
 * we auto-flush telemetry before exceeding this limit (otherwise we risk
 * dropping data)
 */
const MAX_AGGREGATION_SIZE = 54_000;

/**
 * configuration of the interval inside which telemetry data is flushed to
 * Direct.dev infrastructure.
 */
const FLUSH_INTERVAL_MS = 60_000;

/**
 * Telemetry life cycle manager, responsible for:
 *
 * - collecting and aggregating data
 * - periodically consuming and flushing data
 * - formatting payloads to desired format
 */
export class DirectTelemetryManager {
  #config: Config;
  #logger: Logger;
  #isDestroyed = false;

  /**
   * collection of in-memory cache hits
   */
  #cacheHits = new Map<DirectRequestHash, wire.CacheHitEntry>();

  /**
   * collection of in-flight cache hits
   */
  #inflightHits = new Map<DirectRequestHash, wire.CacheHitEntry>();

  /**
   * collection of observed response times across all requests handled within
   * the client, from the time of receiving the request until a response was
   * emitted.
   */
  #responseTimesMs: number[] = [];

  /**
   * current bandwidth usage across Direct.dev connections, as well as
   * estimation of JSON-RPC bandwidth consumption had requests not been
   * intercepted by Direct.dev.
   */
  #bandwidthUsage: BandwidthUsage;

  /**
   * estimation of a JSON serialization of the current payload, given in bytes;
   * updated whenever telemetry is collected and used to auto-flush before
   * exceeding maximum telemetry payload size to ensure operations without
   * reaching size limits on sendBeacon.
   */
  #sizeEstimateInBytes = BASE_TELEMETRY_JSON_IN_BYTES;

  /**
   * contains reports regarding failover events handled within the client.
   */
  #backoffEvents: BackoffEvent[] = [];

  /**
   * timeout used to perform scheduled flushing of telemetry data, so we never
   * accumulate more than a pre-defined threshold of data in one batch.
   */
  #flushTimeout: NodeJS.Timeout | number | undefined;

  constructor(config: Config) {
    this.#config = config;
    this.#bandwidthUsage = {
      http: {
        format: config.preferredFormat ?? "wire",
        upload: 0,
        download: 0,
      },
      sync: {
        format: config.preferredFormat === "jsonrpc" ? "ndjson" : (config.preferredFormat ?? "wire"),
        upload: 0,
        download: 0,
      },
      rpc: {
        upload: 0,
        download: 0,
      },
    };

    this.#logger = new Logger({
      prefix: "Direct.dev: SyncManager:",
      level: config.logLevel,
      context: {
        projectId: config.projectId,
        networkId: config.networkId,
      },
    });
  }

  /**
   * collect observed response times.
   */
  collectResponseTime(ms: number) {
    if (this.#isDestroyed) {
      throw new Error("DirectTelemetryManager.collectResponseTime(): manager is destroyed");
    }

    if (isCongested && ms > maxCongestionMs) {
      this.#logger.debug("collectResponseTime", "dropping ingestion of response time, due to event loop congestion");
    }

    this.#responseTimesMs.push(ms);
    this.#sizeEstimateInBytes += String(ms).length + 1;

    this.#scheduleFlushData();
  }

  /**
   * collect backoff events triggered throughout the client
   */
  collectBackoffEvent(event: BackoffEvent) {
    if (this.#isDestroyed) {
      throw new Error("DirectTelemetryManager.collectBackoffEvent(): manager is destroyed");
    }

    this.#backoffEvents.push(event);
  }

  /**
   * collect observed bandwidth consumption.
   */
  collectBandwidthUsage(params: { type: keyof BandwidthUsage; upload: number; download: number }) {
    if (this.#isDestroyed) {
      throw new Error("DirectTelemetryManager.collectBandwidthUsage(): manager is destroyed");
    }

    this.#bandwidthUsage[params.type].upload += params.upload;
    this.#bandwidthUsage[params.type].download += params.download;

    this.#scheduleFlushData();
  }

  /**
   * collect metrics regarding cache hits within the client.
   */
  collectCacheHit(params: CacheHitParams) {
    if (this.#isDestroyed) {
      throw new Error("DirectTelemetryManager.collectCacheHit(): manager is destroyed");
    }

    this.#collectRequestHit(this.#cacheHits, params);
  }

  /**
   * collect metrics regarding inflight hits within the client.
   */
  collectInflightHit(params: CacheHitParams) {
    if (this.#isDestroyed) {
      throw new Error("DirectTelemetryManager.collectInflightHit(): manager is destroyed");
    }

    this.#collectRequestHit(this.#inflightHits, params);
  }

  /**
   * internal utility for collecting request hit telemetry regardless of the
   * type of request.
   */
  async #collectRequestHit(cache: Map<DirectRequestHash, wire.CacheHitEntry>, params: CacheHitParams) {
    // create telemetry group for this particular request, if it isn't already
    // present in-memory
    const requestHash = inferRequestHashFromCacheKey(params.cacheKey);
    let hitData = cache.get(requestHash);

    if (!hitData) {
      const analyzeInput = {
        requestMethod: normalizeRPCMethod(params.request.method),
        requestBody: params.request,
        requestBlockHeight: params.blockHeight,
      };

      // if a cache hit wasn't already written to memory, then create one now
      hitData = {
        perBlockMetrics: new Map(),
        tiedToBlockHeight: params.cacheKey !== requestHash,
        blockHeightParam: getBlockHeightParam(analyzeInput),
        mayRevalidate: mayRPCRequestRevalidate(analyzeInput),
        maySync: mayRPCRequestSync(analyzeInput),
        requestMethod: params.request.method,
        requestHash,
      };

      // cache the hit in-memory and update raw size estimate
      cache.set(requestHash, hitData);
      this.#sizeEstimateInBytes += hitData.requestMethod.length + (hitData.blockHeightParam?.length ?? 0) + 45;
    }

    // create a per-block representation to allow granular aggregation of
    // timestamps on each block
    let blockData = hitData.perBlockMetrics.get(params.blockHeight);

    if (!blockData) {
      blockData = {
        responseHash: await wire.hashRPCResponse(params.response),
        requestSizeInBytes: wire.RPCRequest.encode(params.request).length,
        responseSizeInBytes: wire.RPCResponse.encode(params.response, {
          requestMethod: normalizeRPCMethod(params.request.method),
        }).length,
        timestamps: [],
      };

      // cache block-data object and update size estimat
      hitData.perBlockMetrics.set(params.blockHeight, blockData);
      this.#sizeEstimateInBytes += 45 + (params.blockHeight ? params.blockHeight.length : 0);
    }

    // push timestamp for cache hit on the specific block and update size
    // estimate to reflect the JSON representation of the data
    blockData.timestamps.push(new Date());
    this.#sizeEstimateInBytes += 10;

    // schedule flushing of telemetry data in a fixed interval
    this.#scheduleFlushData();
  }

  /**
   * format aggregated data into a representation ready for transmission and
   * reset aggregation state.
   */
  consume(includeBackoffEvents?: boolean): wire.TelemetryStructure | undefined {
    // reset scheduled flushing; we can safely assume that consumption emits
    // currently aggregated data
    clearTimeout(this.#flushTimeout);
    this.#flushTimeout = undefined;

    if (
      this.#cacheHits.size === 0 &&
      this.#inflightHits.size === 0 &&
      this.#responseTimesMs.length === 0 &&
      Object.values(this.#bandwidthUsage).every(({ upload, download }) => upload === 0 && download === 0)
    ) {
      return;
    }

    // consume currently aggregated data
    const data: wire.TelemetryStructure = {
      cacheHits: Array.from(this.#cacheHits.values()),
      inflightHits: Array.from(this.#inflightHits.values()),
      responseTimesMs: this.#responseTimesMs,
      backoffEvents: includeBackoffEvents ? this.#backoffEvents : [],
      bandwidthUsage: JSON.parse(JSON.stringify(this.#bandwidthUsage)),
    };

    // reset in-memory data, and size estimate
    this.#cacheHits.clear();
    this.#inflightHits.clear();
    this.#responseTimesMs = [];
    this.#backoffEvents = includeBackoffEvents ? [] : this.#backoffEvents;

    for (const usage of Object.values(this.#bandwidthUsage)) {
      usage.upload = 0;
      usage.download = 0;
    }

    this.#sizeEstimateInBytes = BASE_TELEMETRY_JSON_IN_BYTES;

    // return copy of data in the desired format
    return Object.assign(data, {
      toJSON() {
        // make sure that maps are serialized in a JSON compatible fashion
        return {
          ...data,

          cacheHits: data.cacheHits.map((it) => ({
            ...it,
            perBlockMetrics: Array.from(it.perBlockMetrics.entries()),
          })),

          inflightHits: data.inflightHits.map((it) => ({
            ...it,
            perBlockMetrics: Array.from(it.perBlockMetrics.entries()),
          })),
        };
      },
    });
  }

  /**
   * schedule flushing of telemetry data to run in a fixed interval.
   */
  #scheduleFlushData() {
    if (this.#sizeEstimateInBytes > MAX_AGGREGATION_SIZE) {
      // if payload size has exceeded the predefined maximum allowed size of
      // aggregation, then flush data instantly
      this.flushData();
      return;
    }

    if (this.#flushTimeout !== undefined) {
      // if flushing is already scheduled, then bail out
      return;
    }

    this.#flushTimeout = setTimeout(() => {
      this.flushData();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * submit local cache hits that have not yet been sampled by the Direct.dev
   * RPC Agent, so that we ensure correctness of popularity scoring.
   */
  async flushData(asBeacon?: boolean) {
    // do not include backoffEvents when sending as a beacon; with sendBeacon
    // we have no guarantee of delivery and cannot retain in-memory if delivery
    // fails
    const payload = this.consume(!asBeacon);

    if (!payload) {
      // avoid dispatching anything if there are no metrics to deliver to the
      // upstream
      return;
    }

    if (asBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // use sendBeacon in browser based environments to ensure that telemetry
      // data is delivered
      navigator.sendBeacon(
        this.#config.endpointUrl,
        new Blob([String.fromCharCode(WIRE_VERSION_ID) + wire.telemetry.encode(payload)], {
          type: "application/octet-stream",
        }),
      );
    } else {
      // fall back to regular fetch
      const res = await fetch(this.#config.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: String.fromCharCode(WIRE_VERSION_ID) + wire.telemetry.encode(payload),
      });

      if (!res.ok) {
        // if we didn't manage to ingest backoff events, then re-insert events
        // into memory so they can be dispatched at a later time
        this.#backoffEvents.splice(0, 0, ...payload.backoffEvents);

        this.#logger.debug("flushData", "unable to flush telemetry data", {
          status: res.status,
          statusTest: res.statusText,
          body: await res.text(),
        });
      }
    }
  }

  /**
   * handle destruction of the client
   */
  async destroy() {
    this.#isDestroyed = true;

    try {
      // flush any currently pending data (which also ensures that pending
      // timers are cleared)
      await this.flushData();
    } finally {
      this.persistCriticalTelemetry();
    }
  }

  /**
   * restore persisted telemetry data from previous session (if any) and
   * attempt to flush it immediately
   */
  restoreCriticalTelemetry() {
    try {
      const stateKey = getLocalStorageKey(this.#config);
      const statePayload = readFromLocalStorage(stateKey);

      if (!statePayload) {
        // bail out if no data was persisted
        return;
      }

      const state = persistedTelemetrySchema(JSON.parse(statePayload));
      this.#backoffEvents = state.backoffEvents;

      // once state has been restored in-memory, remove from localStorage
      deleteFromLocalStorage(stateKey);

      // ... and then attempt to flush instantly
      this.flushData();
    } catch (err) {
      // gracefully handle errors when unable to restore telemetry
      this.#logger.debug("restoreCriticalTelemetry", "unable to restore data from state", { err });
    }
  }

  /**
   * write backoff events to persistent storage when user leaves the page, so
   * we can try to re-ingest telemetry upon next visit
   */
  persistCriticalTelemetry() {
    const state: PersistedTelemetry = {
      backoffEvents: this.#backoffEvents,
    };

    writeToLocalStorage(getLocalStorageKey(this.#config), JSON.stringify(state));
  }
}

function getLocalStorageKey(params: Pick<DirectRPCClientConfig, "projectId" | "networkId">): string {
  return params.projectId + ":" + params.networkId;
}

/**
 * detect congestion of event loop, so we can omit ingestion of response times
 * that are falsely prolonged due to local congestion.
 */

const congestionDelay = new Array(20);
const congestionIntervalMs = 50;
const maxCongestionMs = 10;

let prevTimestamp = performance.now();
let isCongested = false;

setInterval(() => {
  const nextTimestamp = performance.now();
  congestionDelay.push(Math.max(0, nextTimestamp - prevTimestamp - congestionIntervalMs));

  // drop stale values, so we only consider recent congestion
  if (congestionDelay.length === 21) {
    congestionDelay.splice(0, 1);
  }

  prevTimestamp = nextTimestamp;

  const avgCongestionMs = congestionDelay.reduce((acc, it) => acc + it, 0) / congestionDelay.length;
  isCongested = avgCongestionMs >= maxCongestionMs;
}, congestionIntervalMs);
