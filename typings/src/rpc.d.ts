/**
 * Block height can be given as a specific blockHeight quantity/value, or by
 * tags which are dynamically resolved by the responding RPC node at runtime
 *
 * This distinction is very important for our handling of cache eligibility of
 * RPC requests, which can be examined further under the
 * `utils.cache-eligibility` namespace
 */
type RPCBlockHeightParam = "earliest" | "latest" | "safe" | "finalized" | "pending" | RPCBlockHeight;
type RPCBlockHeight = `0x${string}`;

/**
 * Direct.dev proprietary version of the JSONRPC-spec, optimized for reduced
 * bandwidth usage
 */
type DirectRPCRequest = {
  id: string | number;
  method: string;
  params?: unknown;
};

/**
 * Direct.dev extension of the native JSONRPC spec, used to guarantee
 * correctness of local cache layer.
 */
type DirectRPCResultResponse = {
  id: string | number;
  result: unknown;

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
type DirectRPCErrorResponse = {
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
type DirectRPCHead = {
  /**
   * array of CacheKeys that will become populated through predictive
   * prefetching within the request stream.
   */
  predictions: DirectCacheKey[];

  /**
   * the currently known block height from within the mirror, at the time of
   * receiving the request.
   */
  blockHeight?: RPCBlockHeight | null;

  /**
   * timestamp for expiration of the currently known block height, which lets
   * the client know for how long it can return responses that are tied to this
   * block.
   */
  blockHeightExpiresAt?: Date | null;
};

/**
 * branded subtype of string, to verify correctness of request hash usage in
 * all integrations
 *
 * the request hash is a stable sha256 hashing of the request, unchanged across
 * block heights, used to reliably sample popularity and perform request
 * predictions
 */
type DirectRequestHash = string & { readonly __brand: unique symbol };

/**
 * branded subtype of string, to verify correctness of cache key usage across
 * integrations
 *
 * the cache key is an extension of the raw RequestHash, including additional
 * details about state of the response (e.g. block height) of relevant
 */
type DirectCacheKey = DirectRequestHash | `${DirectRequestHash}:${RPCBlockHeight | "unknown"}`;

/**
 * Strongly typed definition of cacheable requests, crafted by-hand based on the
 * public JSON-RPC specification.
 *
 * We're using these strong types to allow TypeScript to statically analyze
 * processing of requests and identifying wrongful or inadequate integrations
 * instead of relying on unit tests
 *
 * @see https://ethereum.org/en/developers/docs/apis/json-rpc/
 */
type CacheableRPCRequestParamMap = {
  eth_call: readonly [
    {
      from?: string;
      to: string;
      gas?: string;
      gasPrice?: string;
      value?: string;
      input?: string;
      data?: string;
    },
    RPCBlockHeightParam,
  ];
  eth_chainId: readonly [];
  eth_gasPrice: readonly [];
  eth_getBalance: readonly [string, RPCBlockHeightParam];
  eth_getBlockByHash: readonly [string, boolean];
  eth_getBlockByNumber: readonly [RPCBlockHeightParam, boolean];
  eth_getBlockTransactionCountByHash: readonly [string];
  eth_getBlockTransactionCountByNumber: readonly [RPCBlockHeightParam];
  eth_getCode: readonly [string, RPCBlockHeightParam];
  eth_getStorageAt: readonly [string, string, RPCBlockHeightParam];
  eth_getTransactionByBlockHashAndIndex: readonly [string, string];
  eth_getTransactionByBlockNumberAndIndex: readonly [RPCBlockHeightParam, string];
  eth_getTransactionByHash: readonly [string];
  eth_getTransactionCount: readonly [string, RPCBlockHeightParam];
  eth_getTransactionReceipt: readonly [string];
  eth_getUncleByBlockHashAndIndex: readonly [string, string];
  eth_getUncleByBlockNumberAndIndex: readonly [RPCBlockHeightParam, string];
  eth_getUncleCountByBlockHash: readonly [string];
  eth_getUncleCountByBlockNumber: readonly [RPCBlockHeightParam];
};
