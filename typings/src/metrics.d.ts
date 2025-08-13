/**
 * aggregation of bandwidth usage within the client.
 */
type BandwidthUsage = {
  /**
   * bandwidth usage tied to client state syncing with Direct.dev
   * infrastructure to allow zero-latency delivery of most requested data.
   */
  sync: {
    format: "wire" | "ndjson";
    upload: number;
    download: number;
  };

  /**
   * bandwidth usage on regular HTTP requests emitted by the Direct.dev client
   * in order to serve requests not found in local cache.
   */
  http: {
    format: "wire" | "ndjson" | "jsonrpc";
    upload: number;
    download: number;
  };

  /**
   * estimation of bandwidth usage that would have happened without Direct.dev
   * client, calculated by estimating request + response bodies across all
   * requests sent through the client.
   */
  rpc: {
    upload: number;
    download: number;
  };
};

/**
 * backoff events are emitted when the client detects failures to connect to
 * Direct.dev infrastructure and enters back-off mode falling back to failover
 * providers.
 */
type BackoffEvent = {
  /**
   * source of the backoff event, indicating if it's related to Direct RPC
   * route, Direct Sync or failover providers.
   */
  source: "direct-rpc" | "direct-sync" | "failover";

  /**
   * the context provided to backoff manager when emitting the backoff event.
   */
  contextId: string;

  /**
   * number of consecutive failures registerred for this context.
   */
  failureCount: number;

  /**
   * timestamp for when the backoff was entered
   */
  registerredAt: Date;

  /**
   * duration of the backoff period.
   */
  durationMs: number;
};
