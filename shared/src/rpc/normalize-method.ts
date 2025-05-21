/**
 * normalize RPC request methods, so that methods are recognizeable under their
 * default names regardless of custom provider prefixes (e.g. ftm_call -->
 * eth_call)
 */
export function normalizeRPCMethod(method: string): string {
  const ethMethodName = "eth" + method.slice(method.indexOf("_"));

  return ethMethods.has(ethMethodName) ? ethMethodName : method;
}

const ethMethods = new Set([
  "eth_accounts",
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_coinbase",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getFilterChanges",
  "eth_getFilterLogs",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_getUncleByBlockHashAndIndex",
  "eth_getUncleByBlockNumberAndIndex",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_hashrate",
  "eth_mining",
  "eth_newBlockFilter",
  "eth_newFilter",
  "eth_newPendingTransactionFilter",
  "eth_protocolVersion",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "eth_sign",
  "eth_signTransaction",
  "eth_syncing",
  "eth_uninstallFilter",
]);
