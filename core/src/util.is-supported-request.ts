import type { DirectRPCRequest } from "@direct.dev/shared";

/**
 * tiny utility to determine if the given request is supported by the
 * Direct.dev middleware
 *
 * for unsupported requests, we simply send them directly to configured
 * provider nodes to guarantee correctness of responses delivered in the
 * client.
 *
 * @todo (Kasper, 04-02-2025): review list of supported methods
 */
export function isSupportedRequest(request: DirectRPCRequest & { jsonrpc: string }): boolean {
  if (request.jsonrpc !== "2.0") {
    // we only support jsonrpc 2.0 spec in Direct.dev, for any other requests
    // send straight to source
    return false;
  }

  switch (request.method) {
    case "direct_primer":
    case "net_version":
      return true;
  }

  switch (request.method.split("_").at(-1)) {
    case "blockNumber":
    case "call":
    case "chainId":
    case "estimateGas":
    case "gasPrice":
    case "getBalance":
    case "getBlockByHash":
    case "getBlockByNumber":
    case "getBlockTransactionCountByHash":
    case "getBlockTransactionCountByNumber":
    case "getCode":
    case "getStorageAt":
    case "getTransactionByBlockHashAndIndex":
    case "getTransactionByBlockNumberAndIndex":
    case "getTransactionByHash":
    case "getTransactionCount":
    case "getTransactionReceipt":
    case "getUncleByBlockHashAndIndex":
    case "getUncleByBlockNumberAndIndex":
    case "getUncleCountByBlockHash":
    case "getUncleCountByBlockNumber":
    case "protocolVersion":
    case "sendRawTransaction":
    case "signTransaction":
    case "syncing":
      return true;
  }

  return false;
}
