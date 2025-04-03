/**
 * Direct.dev proprietary version of the JSONRPC-spec, optimized for reduced
 * bandwidth usage
 */
export type DirectRPCRequest = {
  id: string | number;
  method: string;
  params?: unknown;
};

/**
 * Direct.dev extension of the native JSONRPC spec, used to guarantee
 * correctness of local cache layer.
 */
export type DirectRPCSuccessResponse = {
  id: string | number;
  result: unknown;

  /**
   * indicates if the response can be cached locally until block height
   * changes.
   */
  expiresWhenBlockHeightChanges?: boolean | null;

  /**
   * indicates if the response can be cached locally until a specific
   * timestamp in the future.
   */
  expiresAt?: Date | null;
};

/**
 * Direct.dev proprietary version of the JSONRPC-spec, optimized for reduced
 * bandwidth usage
 */
export type DirectRPCErrorResponse = {
  id: string | number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

/**
 * Direct.dev sends a head object on all requests, which informs the client
 * about the current state of the backend, allowing it to synchronize state and
 * maximize cache hit count directly in the client.
 */
export type DirectRPCHead = {
  /**
   * array of RPCRequestHashes that have been predicted for subsequent
   * requests, and which will be included within the batch automatically.
   */
  predictions: RPCRequestHash[];

  /**
   * the currently known block height from within the mirror, at the time of
   * receiving the request.
   */
  blockHeight?: string | null;

  /**
   * timestamp for expiration of the currently known block height, which lets
   * the client know for how long it can return responses that are tied to this
   * block.
   */
  blockHeightExpiresAt?: Date | null;
};

/**
 * subtype of string, to be used when handling request hashes for
 * identification of cache hits
 */
export type RPCRequestHash = string;
