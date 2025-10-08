import { makeEnumPacker, pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

/**
 * encodes telemetry regarding client performance for ingestion into Direct.dev
 * dashboard insights.
 */
export type TelemetryStructure = {
  cacheHits: CacheHitEntry[];
  inflightHits: CacheHitEntry[];

  /**
   * collection of observed response times within the client, used to generate
   * profiles of average end-to-end response times
   */
  responseTimesMs: number[];

  /**
   * collection of backoff events observed in the client layer.
   */
  backoffEvents: BackoffEvent[];

  /**
   * aggregated bandwidth consumption of the client since last emitted event,
   * used to benchmark bandwidth consumption of Direct.dev vs. native JSON-RPC
   */
  bandwidthUsage: BandwidthUsage;
};

export type CacheHitEntry = {
  requestMethod: string;
  requestHash: DirectRequestHash;

  /**
   * specifies if this request was cached under a specific block height
   */
  tiedToBlockHeight: boolean;

  /**
   * contains the original block height param applied for the request.
   */
  blockHeightParam: RPCBlockHeightParam | undefined;

  /**
   * specifies if the request may be automatically revalidated if popular
   * enough.
   */
  mayRevalidate: boolean;

  /**
   * specifies if revalidated responses may be synced to clients in real time.
   */
  maySync: boolean;

  /**
   * collection of metrics associated with each block, where this request was
   * handled by client cache mechanisms.
   */
  perBlockMetrics: Map<
    RPCBlockHeight | undefined,
    {
      /**
       * total size of the raw request body in bytes
       */
      requestSizeInBytes: number;

      /**
       * total size of the raw response body in bytes
       */
      responseSizeInBytes: number;

      /**
       * the hash of the response as it looked on this block height
       */
      responseHash: DirectResponseHash;

      /**
       * all timestamps at which this request/response pair was observed
       */
      timestamps: Date[];
    }
  >;
};

/**
 * implementation of Wire packer for telemetry messages sent from client to
 * Direct.dev infrastructure.
 */
export const telemetry = new Wire<TelemetryStructure>({
  encode: (input) =>
    pack.arr(input.cacheHits, (it) => cacheHitWire.encode(it)) +
    pack.arr(input.inflightHits, (it) => cacheHitWire.encode(it)) +
    pack.arr(input.responseTimesMs, (it) => pack.int(it)) +
    pack.arr(input.backoffEvents, (it) => backoffEvent.encode(it)) +
    syncFormatEnum.encode(input.bandwidthUsage.sync.format) +
    pack.int(input.bandwidthUsage.sync.upload) +
    pack.int(input.bandwidthUsage.sync.download) +
    httpFormatEnum.encode(input.bandwidthUsage.http.format) +
    pack.int(input.bandwidthUsage.http.upload) +
    pack.int(input.bandwidthUsage.http.download) +
    pack.int(input.bandwidthUsage.rpc.upload) +
    pack.int(input.bandwidthUsage.rpc.download),
  decode: (input, cursor) => {
    const cacheHits = unpack.arr(input, cursor, (cursor) => cacheHitWire.decode(input, cursor));
    const inflightHits = unpack.arr(input, cacheHits[1], (cursor) => cacheHitWire.decode(input, cursor));
    const responseTimesMs = unpack.arr(input, inflightHits[1], (cursor) => unpack.int(input, cursor));
    const backoffEvents = unpack.arr(input, responseTimesMs[1], (cursor) => backoffEvent.decode(input, cursor));
    const syncFormat = syncFormatEnum.decode(input, backoffEvents[1]);
    const syncUpload = unpack.int(input, syncFormat[1]);
    const syncDownload = unpack.int(input, syncUpload[1]);
    const httpFormat = httpFormatEnum.decode(input, syncDownload[1]);
    const httpUpload = unpack.int(input, httpFormat[1]);
    const httpDownload = unpack.int(input, httpUpload[1]);
    const rpcUpload = unpack.int(input, httpDownload[1]);
    const rpcDownload = unpack.int(input, rpcUpload[1]);

    return [
      {
        cacheHits: cacheHits[0],
        inflightHits: inflightHits[0],
        responseTimesMs: responseTimesMs[0],
        backoffEvents: backoffEvents[0],
        bandwidthUsage: {
          sync: {
            format: syncFormat[0],
            upload: syncUpload[0],
            download: syncDownload[0],
          },
          http: {
            format: httpFormat[0],
            upload: httpUpload[0],
            download: httpDownload[0],
          },
          rpc: {
            upload: rpcUpload[0],
            download: rpcDownload[0],
          },
        },
      },
      rpcDownload[1],
    ];
  },
});

const cacheHitWire = new Wire<CacheHitEntry>({
  encode: (input) =>
    pack.arr(
      Array.from(input.perBlockMetrics.entries()),
      ([blockHeight, metrics]) =>
        pack.nullableStr(blockHeight) +
        pack.hash(metrics.responseHash) +
        pack.int(metrics.requestSizeInBytes) +
        pack.int(metrics.responseSizeInBytes) +
        pack.arr(metrics.timestamps, (item) => pack.date(item)),
    ) +
    pack.str(input.requestMethod) +
    pack.hash(input.requestHash) +
    pack.bool(input.tiedToBlockHeight) +
    pack.nullableStr(input.blockHeightParam) +
    pack.bool(input.mayRevalidate) +
    pack.bool(input.maySync),
  decode: (input, cursor) => {
    const perBlockMetrics = unpack.arr(input, cursor, (cursor) => {
      const blockHeight = unpack.nullableStr(input, cursor);
      const responseHash = unpack.hash(input, blockHeight[1]);
      const requestSizeInBytes = unpack.int(input, responseHash[1]);
      const responseSizeInBytes = unpack.int(input, requestSizeInBytes[1]);
      const timestamps = unpack.arr(input, responseSizeInBytes[1], (cursor) => unpack.date(input, cursor));

      return [
        [
          (blockHeight[0] as RPCBlockHeight) ?? undefined,
          {
            responseHash: responseHash[0] as DirectResponseHash,
            requestSizeInBytes: requestSizeInBytes[0],
            responseSizeInBytes: responseSizeInBytes[0],
            timestamps: timestamps[0],
          },
        ] as const,
        timestamps[1],
      ];
    });
    const requestMethod = unpack.str(input, perBlockMetrics[1]);
    const requestHash = unpack.hash(input, requestMethod[1]);
    const tiedToBlockHeight = unpack.bool(input, requestHash[1]);
    const blockHeightParam = unpack.nullableStr(input, tiedToBlockHeight[1]);
    const mayRevalidate = unpack.bool(input, blockHeightParam[1]);
    const maySync = unpack.bool(input, mayRevalidate[1]);

    return [
      {
        perBlockMetrics: new Map(perBlockMetrics[0]),
        requestMethod: requestMethod[0] as DirectRequestMethod,
        requestHash: requestHash[0] as DirectRequestHash,
        tiedToBlockHeight: tiedToBlockHeight[0],
        blockHeightParam: (blockHeightParam[0] as RPCBlockHeightParam) ?? undefined,
        mayRevalidate: mayRevalidate[0],
        maySync: maySync[0],
      },
      maySync[1],
    ];
  },
});

export const backoffEvent = new Wire<BackoffEvent>({
  encode: (input) =>
    backoffSourceEnum.encode(input.source) +
    pack.str(input.contextId) +
    pack.int(input.failureCount) +
    pack.date(input.registerredAt) +
    pack.int(input.durationMs),
  decode: (input, cursor) => {
    const source = backoffSourceEnum.decode(input, cursor);
    const contextId = unpack.str(input, source[1]);
    const failureCount = unpack.int(input, contextId[1]);
    const registerredAt = unpack.date(input, failureCount[1]);
    const durationMs = unpack.int(input, registerredAt[1]);

    return [
      {
        source: source[0],
        contextId: contextId[0],
        failureCount: failureCount[0],
        registerredAt: registerredAt[0],
        durationMs: durationMs[0],
      },
      durationMs[1],
    ];
  },
});

const syncFormatEnum = makeEnumPacker(["wire", "ndjson"]);
const httpFormatEnum = makeEnumPacker(["wire", "ndjson", "jsonrpc"]);
const backoffSourceEnum = makeEnumPacker(["direct-rpc", "direct-sync", "failover"]);
