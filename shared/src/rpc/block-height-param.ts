export function getBlockHeightParam(request: {
  requestBody: DirectRPCRequest;
  requestMethod: string;
}): RPCBlockHeightParam | "implicit-latest" | undefined {
  switch (request.requestMethod) {
    case "eth_getBlockByNumber":
    case "eth_getBlockTransactionCountByNumber":
    case "eth_getTransactionByBlockNumberAndIndex":
    case "eth_getUncleByBlockNumberAndIndex":
    case "eth_getUncleCountByBlockNumber":
      return (request.requestBody.params as CacheableRPCRequestParamMap[typeof request.requestMethod])[0];

    case "eth_call":
    case "eth_getBalance":
    case "eth_getCode":
    case "eth_getTransactionCount":
      return (request.requestBody.params as CacheableRPCRequestParamMap[typeof request.requestMethod])[1];

    case "eth_getStorageAt":
      return (request.requestBody.params as CacheableRPCRequestParamMap[typeof request.requestMethod])[2];

    case "eth_blockNumber":
      return "implicit-latest";

    default:
      return undefined;
  }
}

/**
 * Immutably replace the BlockHeight param of an RPC request.
 */
export function setBlockHeightParam(
  request: {
    requestBody: DirectRPCRequest;
    requestMethod: string;
  },
  blockHeightParam: RPCBlockHeightParam,
): DirectRPCRequest {
  const reqMethod = request.requestMethod as keyof CacheableRPCRequestParamMap;

  switch (reqMethod) {
    case "eth_getBlockByNumber":
    case "eth_getBlockTransactionCountByNumber":
    case "eth_getTransactionByBlockNumberAndIndex":
    case "eth_getUncleByBlockNumberAndIndex":
    case "eth_getUncleCountByBlockNumber":
      return {
        ...request.requestBody,
        params: (request.requestBody.params as CacheableRPCRequestParamMap[typeof reqMethod]).with(0, blockHeightParam),
      };

    case "eth_call":
    case "eth_getBalance":
    case "eth_getCode":
    case "eth_getTransactionCount":
      return {
        ...request.requestBody,
        params: (request.requestBody.params as CacheableRPCRequestParamMap[typeof reqMethod]).with(1, blockHeightParam),
      };

    case "eth_getStorageAt":
      return {
        ...request.requestBody,
        params: (request.requestBody.params as CacheableRPCRequestParamMap[typeof reqMethod]).with(2, blockHeightParam),
      };

    case "eth_chainId":
    case "eth_gasPrice":
    case "eth_getBlockByHash":
    case "eth_getBlockTransactionCountByHash":
    case "eth_getTransactionByBlockHashAndIndex":
    case "eth_getTransactionByHash":
    case "eth_getTransactionReceipt":
    case "eth_getUncleByBlockHashAndIndex":
    case "eth_getUncleCountByBlockHash":
      return request.requestBody;

    default:
      return request.requestBody;
  }
}
