import { LRUByteSizeCache, normalizeRPCMethod, setBlockHeightParam, hash, sortObject } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RPCRequestStructure = DirectRPCRequest & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
};

type RPCRequestOptions = {
  /**
   * if specified, then the block height parameter (on applicable methods) will
   * be overriden with this value when doing encoding
   */
  overrideBlockHeight?: RPCBlockHeightParam;

  /**
   * if available, then a pre-encoded version of the request can be provided
   * here and re-used unless other configurations apply.
   */
  preEncoded?: string | null | undefined;
};

/**
 * implementation of WirePackers for common eth request signatures
 */
export const RPCRequest = new Wire<RPCRequestStructure, [options?: RPCRequestOptions | undefined]>(
  {
    eth_blockNumber: {
      id: 1,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_blockNumber",
            params: [],
          },
          bypassMirror[1],
        ];
      },
    },

    eth_call: {
      id: 2,
      encode: (input, [options]) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0].to) +
        pack.nullableStr(input.params[0].from) +
        pack.nullableStr(input.params[0].data) +
        pack.nullableStr(input.params[0].input) +
        pack.nullableStr(input.params[0].value) +
        pack.nullableStr(input.params[0].gas) +
        pack.nullableStr(input.params[0].gasPrice) +
        // @note -- this is where we handle block override during encoding
        pack.str(options?.overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const toParam = unpack.str(input, bypassMirror[1]);
        const fromParam = unpack.nullableStr(input, toParam[1]);
        const dataParam = unpack.nullableStr(input, fromParam[1]);
        const inputParam = unpack.nullableStr(input, dataParam[1]);
        const valueParam = unpack.nullableStr(input, inputParam[1]);
        const gasParam = unpack.nullableStr(input, valueParam[1]);
        const gasPriceParam = unpack.nullableStr(input, gasParam[1]);
        const blockHeight = unpack.str(input, gasPriceParam[1]);

        return [
          {
            method: "eth_call",
            id: id[0],
            bypassMirror: bypassMirror[0],
            params: [
              {
                to: toParam[0],
                from: fromParam[0],
                data: dataParam[0],
                input: inputParam[0],
                value: valueParam[0],
                gas: gasParam[0],
                gasPrice: gasPriceParam[0],
              },
              blockHeight[0],
            ],
          },
          blockHeight[1],
        ];
      },
    },

    eth_chainId: {
      id: 3,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_chainId",
            params: [],
          },
          bypassMirror[1],
        ];
      },
    },

    eth_gasPrice: {
      id: 4,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_gasPrice",
            params: [],
          },
          bypassMirror[1],
        ];
      },
    },

    eth_getBalance: {
      id: 5,
      encode: (input, [options]) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        // @note -- this is where we handle block override during encoding
        pack.str(options?.overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const address = unpack.str(input, bypassMirror[1]);
        const blockHeight = unpack.str(input, address[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getBalance",
            params: [address[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getBlockByHash: {
      id: 6,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        pack.bool(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockHash = unpack.str(input, bypassMirror[1]);
        const fullOutput = unpack.bool(input, blockHash[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getBlockByHash",
            params: [blockHash[0], fullOutput[0]],
          },
          fullOutput[1],
        ];
      },
    },

    eth_getBlockByNumber: {
      id: 7,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        pack.bool(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockHeight = unpack.str(input, bypassMirror[1]);
        const fullOutput = unpack.bool(input, blockHeight[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getBlockByNumber",
            params: [blockHeight[0], fullOutput[0]],
          },
          fullOutput[1],
        ];
      },
    },

    eth_getBlockTransactionCountByHash: {
      id: 8,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockHash = unpack.str(input, bypassMirror[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getBlockTransactionCountByHash",
            params: [blockHash[0]],
          },
          blockHash[1],
        ];
      },
    },

    eth_getBlockTransactionCountByNumber: {
      id: 9,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockHeight = unpack.str(input, bypassMirror[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getBlockTransactionCountByNumber",
            params: [blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getCode: {
      id: 10,
      encode: (input, [options]) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        // @note -- this is where we handle block override during encoding
        pack.str(options?.overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const address = unpack.str(input, bypassMirror[1]);
        const blockHeight = unpack.str(input, address[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getCode",
            params: [address[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getStorageAt: {
      id: 11,
      encode: (input, [options]) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        pack.str(input.params[1]) +
        // @note -- this is where we handle block override during encoding
        pack.str(options?.overrideBlockHeight ?? input.params[2]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const address = unpack.str(input, bypassMirror[1]);
        const quantity = unpack.str(input, address[1]);
        const blockHeight = unpack.str(input, quantity[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getStorageAt",
            params: [address[0], quantity[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getTransactionByBlockHashAndIndex: {
      id: 12,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        pack.str(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockHash = unpack.str(input, bypassMirror[1]);
        const quantity = unpack.str(input, blockHash[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getTransactionByBlockHashAndIndex",
            params: [blockHash[0], quantity[0]],
          },
          quantity[1],
        ];
      },
    },

    eth_getTransactionByBlockNumberAndIndex: {
      id: 13,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        pack.str(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockNumber = unpack.str(input, bypassMirror[1]);
        const quantity = unpack.str(input, blockNumber[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getTransactionByBlockNumberAndIndex",
            params: [blockNumber[0], quantity[0]],
          },
          quantity[1],
        ];
      },
    },

    eth_getTransactionByHash: {
      id: 14,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const txHash = unpack.str(input, bypassMirror[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getTransactionByHash",
            params: [txHash[0]],
          },
          txHash[1],
        ];
      },
    },

    eth_getTransactionCount: {
      id: 15,
      encode: (input, [options]) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        // @note -- this is where we handle block override during encoding
        pack.str(options?.overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const address = unpack.str(input, bypassMirror[1]);
        const blockHeight = unpack.str(input, address[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getTransactionCount",
            params: [address[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getTransactionReceipt: {
      id: 16,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const txHash = unpack.str(input, bypassMirror[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getTransactionReceipt",
            params: [txHash[0]],
          },
          txHash[1],
        ];
      },
    },

    eth_getUncleByBlockHashAndIndex: {
      id: 17,
      encode: (input, [options]) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        pack.str(options?.overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockHash = unpack.str(input, bypassMirror[1]);
        const blockIndex = unpack.str(input, blockHash[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getUncleByBlockHashAndIndex",
            params: [blockHash[0], blockIndex[0]],
          },
          blockIndex[1],
        ];
      },
    },

    eth_getUncleByBlockNumberAndIndex: {
      id: 18,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0]) +
        pack.str(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockNumber = unpack.str(input, bypassMirror[1]);
        const blockIndex = unpack.str(input, blockNumber[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getUncleByBlockNumberAndIndex",
            params: [blockNumber[0], blockIndex[0]],
          },
          blockIndex[1],
        ];
      },
    },

    eth_getUncleCountByBlockHash: {
      id: 19,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockHash = unpack.str(input, bypassMirror[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getUncleCountByBlockHash",
            params: [blockHash[0]],
          },
          blockHash[1],
        ];
      },
    },

    eth_getUncleCountByBlockNumber: {
      id: 20,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const blockNumber = unpack.str(input, bypassMirror[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getUncleCountByBlockNumber",
            params: [blockNumber[0]],
          },
          blockNumber[1],
        ];
      },
    },

    eth_getLogs: {
      id: 21,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.nullableStr(input.params[0].fromBlock) +
        pack.nullableStr(input.params[0].toBlock) +
        pack.json(input.params[0].address) +
        pack.json(input.params[0].topics) +
        pack.nullableStr(input.params[0].blockhash),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const fromBlock = unpack.nullableStr(input, bypassMirror[1]);
        const toBlock = unpack.nullableStr(input, fromBlock[1]);
        const address = unpack.json(input, toBlock[1]);
        const topics = unpack.json(input, address[1]);
        const blockhash = unpack.nullableStr(input, topics[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_getLogs",
            params: [
              {
                fromBlock: fromBlock[0],
                toBlock: toBlock[0],
                address: address[0],
                topics: topics[0],
                blockhash: blockhash[0],
              },
            ],
          },
          blockhash[1],
        ];
      },
    },

    eth_signTransaction: {
      id: 22,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.json(input.params[0].type) +
        pack.str(input.params[0].from) +
        pack.nullableStr(input.params[0].to) +
        pack.nullableStr(input.params[0].gas) +
        pack.nullableStr(input.params[0].gasPrice) +
        pack.nullableStr(input.params[0].value) +
        pack.str(input.params[0].data) +
        pack.nullableStr(input.params[0].nonce),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const type = unpack.json(input, bypassMirror[1]);
        const from = unpack.str(input, type[1]);
        const to = unpack.nullableStr(input, from[1]);
        const gas = unpack.nullableStr(input, to[1]);
        const gasPrice = unpack.nullableStr(input, gas[1]);
        const value = unpack.nullableStr(input, gasPrice[1]);
        const data = unpack.str(input, value[1]);
        const nonce = unpack.nullableStr(input, data[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_signTransaction",
            params: [
              {
                type: type[0],
                from: from[0],
                to: to[0],
                gas: gas[0],
                gasPrice: gasPrice[0],
                value: value[0],
                data: data[0],
                nonce: nonce[0],
              },
            ],
          },
          nonce[1],
        ];
      },
    },

    eth_sendTransaction: {
      id: 23,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.str(input.params[0].from) +
        pack.nullableStr(input.params[0].to) +
        pack.nullableStr(input.params[0].gas) +
        pack.nullableStr(input.params[0].gasPrice) +
        pack.nullableStr(input.params[0].value) +
        pack.str(input.params[0].data) +
        pack.nullableStr(input.params[0].nonce),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const from = unpack.str(input, bypassMirror[1]);
        const to = unpack.nullableStr(input, from[1]);
        const gas = unpack.nullableStr(input, to[1]);
        const gasPrice = unpack.nullableStr(input, gas[1]);
        const value = unpack.nullableStr(input, gasPrice[1]);
        const data = unpack.str(input, value[1]);
        const nonce = unpack.nullableStr(input, data[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_sendTransaction",
            params: [
              {
                from: from[0],
                to: to[0],
                gas: gas[0],
                gasPrice: gasPrice[0],
                value: value[0],
                data: data[0],
                nonce: nonce[0],
              },
            ],
          },
          nonce[1],
        ];
      },
    },

    eth_sendRawTransaction: {
      id: 24,
      encode: (input) => pack.strOrNum(input.id) + pack.bool(!!input.bypassMirror) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const data = unpack.str(input, bypassMirror[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_sendRawTransaction",
            params: [data[0]],
          },
          data[1],
        ];
      },
    },

    eth_newFilter: {
      id: 25,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.bool(!!input.bypassMirror) +
        pack.nullableStr(input.params[0].fromBlock) +
        pack.nullableStr(input.params[0].toBlock) +
        pack.json(input.params[0].address) +
        pack.json(input.params[0].topics),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const bypassMirror = unpack.bool(input, id[1]);
        const fromBlock = unpack.nullableStr(input, bypassMirror[1]);
        const toBlock = unpack.nullableStr(input, fromBlock[1]);
        const address = unpack.json(input, toBlock[1]);
        const topics = unpack.json(input, address[1]);

        return [
          {
            id: id[0],
            bypassMirror: bypassMirror[0],
            method: "eth_newFilter",
            params: [
              {
                fromBlock: fromBlock[0],
                toBlock: toBlock[0],
                address: address[0],
                topics: topics[0],
              },
            ],
          },
          topics[1],
        ];
      },
    },
  },
  (input, [options]) => {
    // if a pre-encoded version of the input was provided, then determine if it
    // can be re-used "as is"
    if (options?.preEncoded) {
      switch (input.method) {
        case "eth_call":
        case "eth_getBalance":
        case "eth_getCode":
        case "eth_getStorageAt":
        case "eth_getTransactionCount":
        case "eth_getUncleByBlockHashAndIndex":
          if (options.overrideBlockHeight != null) {
            return { preEncoded: options.preEncoded };
          }
          break;

        default:
          return { preEncoded: options.preEncoded };
      }
    }

    return input.method;
  },
);

/**
 * consistent hasher for requests, which gracefully andles scrambled property
 * ordering and generates consistent hashes for idempotent requests regardless
 * of ID
 */
export function hashRPCRequest(input: {
  requestMethod?: DirectRequestMethod;
  requestBody: RPCRequestStructure;
  overrideBlockHeight?: RPCBlockHeightParam;
}): DirectRequestHash {
  const requestMethod = input.requestMethod ?? normalizeRPCMethod(input.requestBody.method);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqId = idempotentMethods.has(requestMethod as any) ? "" : crypto.randomUUID();
  const reqBody = input.overrideBlockHeight
    ? setBlockHeightParam(
        {
          requestMethod,
          requestBody: input.requestBody,
        },
        input.overrideBlockHeight,
      )
    : input.requestBody;

  return withCache(reqId + reqBody.method + sortObject(reqBody.params));
}

/**
 * tiny wrapper which enables reading popular request hashes from cache instead
 * of re-hashing over and over again in the browser.
 */
const withCache = (() => {
  if (typeof window === "undefined") {
    return (hashInput: string) => hash(hashInput) as DirectRequestHash;
  }

  const cache = new LRUByteSizeCache<string, DirectRequestHash>(5_000_000);

  return (hashInput: string): DirectRequestHash => {
    if (hashInput.length > 250_000) {
      // if the hash input exceeds cacheable size limit, then always hash
      return hash(hashInput) as DirectRequestHash;
    }

    // ... otherwise read hash from cache if possible
    let output = cache.get(hashInput);

    if (output === undefined) {
      output = hash(hashInput) as DirectRequestHash;
      cache.set(hashInput, output, hashInput.length);
    }

    return output;
  };
})();

export const idempotentMethods = new Set([
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
  "direct_getTransactionReceipt",
  "eth_getUncleByBlockHashAndIndex",
  "eth_getUncleByBlockNumberAndIndex",
  "eth_getUncleCountByBlockHash",
  "eth_getUncleCountByBlockNumber",
  "eth_hashrate",
  "eth_mining",
  "eth_protocolVersion",
  "eth_sign",
  "net_version",
  "web3_clientVersion",
  "web3_sha3",
] as const);
