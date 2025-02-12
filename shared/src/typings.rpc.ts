/**
 * Direct.dev proprietary version of the JSONRPC-spec, optimized for reduced
 * bandwidth usage
 */
export type DirectRPCRequest = {
  id: string | number;
  method: string;
  params: readonly unknown[];
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
  b?: true;

  /**
   * indicates if the response can be cached locally until a specific
   * timestamp in the future (ie. "expires at").
   */
  e?: string;
};

/**
 * Direct.dev proprietary version of the JSONRPC-spec, optimized for reduced
 * bandwidth usage
 */
export type DirectRPCErrorResponse = {
  id: string | number;
  error: {
    code: string | number;
    message: string;
  };
};

/**
 * subtype of string, to be used when handling request hashes for
 * identification of cache hits
 */
export type RPCRequestHash = string;
