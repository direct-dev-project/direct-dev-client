import { normalizeRPCMethod } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RPCRequestStructure = DirectRPCRequest & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;

  /**
   * when doing encoding/hashing of requests, we sometimes need to override the
   * block height to provide consistency guarantees for data returned.
   */
  __overrideBlockHeight?: string;
};

/**
 * implementation of WirePackers for common eth request signatures
 */
export const RPCRequest = new Wire<RPCRequestStructure, [options: { truncated: boolean }] | []>(
  {
    direct_primer: {
      id: 1,
      encode: (input) => pack.strOrNum(input.id) + pack.nullableStr(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const context = unpack.nullableStr(input, id[1]);

        return [
          {
            id: id[0],
            method: "direct_primer",
            params: context[0] != null ? [context[0]] : [],
          },
          context[1],
        ];
      },
    },

    eth_blockNumber: {
      id: 2,
      encode: (input) => pack.strOrNum(input.id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return [
          {
            id: id[0],
            method: "eth_blockNumber",
            params: [],
          },
          id[1],
        ];
      },
    },

    eth_call: {
      id: 3,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.str(input.params[0].to) +
        pack.nullableStr(input.params[0].from) +
        pack.nullableStr(input.params[0].data) +
        pack.nullableStr(input.params[0].input) +
        pack.nullableStr(input.params[0].value) +
        pack.nullableStr(input.params[0].gas) +
        pack.nullableStr(input.params[0].gasPrice) +
        // @note -- this is where we handle block override during encoding
        pack.str(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const toParam = unpack.str(input, id[1]);
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

    eth_call__truncated: {
      id: 4,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.str(input.params[0].to) +
        pack.nullableStr(input.params[0].from) +
        // @note -- this is where we handle block override during encoding
        pack.str(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const toParam = unpack.str(input, id[1]);
        const fromParam = unpack.nullableStr(input, toParam[1]);
        const blockHeight = unpack.str(input, fromParam[1]);

        return [
          {
            method: "eth_call",
            id: id[0],
            params: [
              {
                to: toParam[0],
                from: fromParam[0],
                data: undefined,
                input: undefined,
                value: undefined,
                gas: undefined,
                gasPrice: undefined,
              },
              blockHeight[0],
            ],
          },
          blockHeight[1],
        ];
      },
    },

    eth_chainId: {
      id: 5,
      encode: (input) => pack.strOrNum(input.id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return [
          {
            id: id[0],
            method: "eth_chainId",
            params: [],
          },
          id[1],
        ];
      },
    },

    eth_gasPrice: {
      id: 6,
      encode: (input) => pack.strOrNum(input.id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return [
          {
            id: id[0],
            method: "eth_gasPrice",
            params: [],
          },
          id[1],
        ];
      },
    },

    eth_getBalance: {
      id: 7,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.str(input.params[0]) +
        // @note -- this is where we handle block override during encoding
        pack.str(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const address = unpack.str(input, id[1]);
        const blockHeight = unpack.str(input, address[1]);

        return [
          {
            id: id[0],
            method: "eth_getBalance",
            params: [address[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getBlockByHash: {
      id: 8,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]) + pack.bool(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockHash = unpack.str(input, id[1]);
        const fullOutput = unpack.bool(input, blockHash[1]);

        return [
          {
            id: id[0],
            method: "eth_getBlockByHash",
            params: [blockHash[0], fullOutput[0]],
          },
          fullOutput[1],
        ];
      },
    },

    eth_getBlockByNumber: {
      id: 9,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]) + pack.bool(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockHeight = unpack.str(input, id[1]);
        const fullOutput = unpack.bool(input, blockHeight[1]);

        return [
          {
            id: id[0],
            method: "eth_getBlockByNumber",
            params: [blockHeight[0], fullOutput[0]],
          },
          fullOutput[1],
        ];
      },
    },

    eth_getBlockTransactionCountByHash: {
      id: 10,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockHash = unpack.str(input, id[1]);

        return [
          {
            id: id[0],
            method: "eth_getBlockTransactionCountByHash",
            params: [blockHash[0]],
          },
          blockHash[1],
        ];
      },
    },

    eth_getBlockTransactionCountByNumber: {
      id: 11,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockHeight = unpack.str(input, id[1]);

        return [
          {
            id: id[0],
            method: "eth_getBlockTransactionCountByNumber",
            params: [blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getCode: {
      id: 12,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.str(input.params[0]) +
        // @note -- this is where we handle block override during encoding
        pack.str(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const address = unpack.str(input, id[1]);
        const blockHeight = unpack.str(input, address[1]);

        return [
          {
            id: id[0],
            method: "eth_getCode",
            params: [address[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getStorageAt: {
      id: 13,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.str(input.params[0]) +
        pack.str(input.params[1]) +
        // @note -- this is where we handle block override during encoding
        pack.str(input.__overrideBlockHeight ?? input.params[2]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const address = unpack.str(input, id[1]);
        const quantity = unpack.str(input, address[1]);
        const blockHeight = unpack.str(input, quantity[1]);

        return [
          {
            id: id[0],
            method: "eth_getStorageAt",
            params: [address[0], quantity[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getTransactionByBlockHashAndIndex: {
      id: 14,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]) + pack.str(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockHash = unpack.str(input, id[1]);
        const quantity = unpack.str(input, blockHash[1]);

        return [
          {
            id: id[0],
            method: "eth_getTransactionByBlockHashAndIndex",
            params: [blockHash[0], quantity[0]],
          },
          quantity[1],
        ];
      },
    },

    eth_getTransactionByBlockNumberAndIndex: {
      id: 15,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]) + pack.str(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockNumber = unpack.str(input, id[1]);
        const quantity = unpack.str(input, blockNumber[1]);

        return [
          {
            id: id[0],
            method: "eth_getTransactionByBlockNumberAndIndex",
            params: [blockNumber[0], quantity[0]],
          },
          quantity[1],
        ];
      },
    },

    eth_getTransactionByHash: {
      id: 16,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const txHash = unpack.str(input, id[1]);

        return [
          {
            id: id[0],
            method: "eth_getTransactionByHash",
            params: [txHash[0]],
          },
          txHash[1],
        ];
      },
    },

    eth_getTransactionCount: {
      id: 17,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.str(input.params[0]) +
        // @note -- this is where we handle block override during encoding
        pack.str(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const address = unpack.str(input, id[1]);
        const blockHeight = unpack.str(input, address[1]);

        return [
          {
            id: id[0],
            method: "eth_getTransactionCount",
            params: [address[0], blockHeight[0]],
          },
          blockHeight[1],
        ];
      },
    },

    eth_getTransactionReceipt: {
      id: 18,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const txHash = unpack.str(input, id[1]);

        return [
          {
            id: id[0],
            method: "eth_getTransactionReceipt",
            params: [txHash[0]],
          },
          txHash[1],
        ];
      },
    },

    eth_getUncleByBlockHashAndIndex: {
      id: 19,
      encode: (input) =>
        pack.strOrNum(input.id) + pack.str(input.params[0]) + pack.str(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockHash = unpack.str(input, id[1]);
        const blockIndex = unpack.str(input, blockHash[1]);

        return [
          {
            id: id[0],
            method: "eth_getUncleByBlockHashAndIndex",
            params: [blockHash[0], blockIndex[0]],
          },
          blockIndex[1],
        ];
      },
    },

    eth_getUncleByBlockNumberAndIndex: {
      id: 20,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]) + pack.str(input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockNumber = unpack.str(input, id[1]);
        const blockIndex = unpack.str(input, blockNumber[1]);

        return [
          {
            id: id[0],
            method: "eth_getUncleByBlockNumberAndIndex",
            params: [blockNumber[0], blockIndex[0]],
          },
          blockIndex[1],
        ];
      },
    },

    eth_getUncleCountByBlockHash: {
      id: 21,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockHash = unpack.str(input, id[1]);

        return [
          {
            id: id[0],
            method: "eth_getUncleCountByBlockHash",
            params: [blockHash[0]],
          },
          blockHash[1],
        ];
      },
    },

    eth_getUncleCountByBlockNumber: {
      id: 22,
      encode: (input) => pack.strOrNum(input.id) + pack.str(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const blockNumber = unpack.str(input, id[1]);

        return [
          {
            id: id[0],
            method: "eth_getUncleCountByBlockNumber",
            params: [blockNumber[0]],
          },
          blockNumber[1],
        ];
      },
    },
  },
  (input, [options]) => {
    if (options?.truncated && input.method === "eth_call") {
      return "eth_call__truncated";
    }

    return input.method;
  },
);

/**
 * blazingly fast and consistent hasher for ETH requests, which gracefully
 * handles scrambled property ordering and generates consistent hashes for
 * idempotent requests regardless of ID
 */
export function hashRPCRequest(
  input: {
    requestMethod?: string;
    requestBody: RPCRequestStructure;
  },
  __encodedRequest?: string,
): Promise<DirectRequestHash> {
  const reqMethod = input.requestMethod ?? normalizeRPCMethod(input.requestBody.method);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqId = idempotentMethods.has(reqMethod as any) ? "" : crypto.randomUUID();

  if (__encodedRequest !== undefined) {
    return RPCRequest.hash(
      { ...input.requestBody, id: reqId },

      // hyper-optimizing; if we received an already encoded request structure,
      // then re-use that string replacing only the ID segment (which we know to
      // occurr first across all request types)
      __encodedRequest.charAt(0) + pack.str(reqId) + __encodedRequest.slice(unpack.strOrNum(__encodedRequest, 1)[1]),
    ) as Promise<DirectRequestHash>;
  }

  return RPCRequest.hash({ ...input.requestBody, id: reqId }, undefined) as Promise<DirectRequestHash>;
}

export const idempotentMethods = new Set([
  "direct_primer",
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
  "eth_protocolVersion",
  "eth_sign",
  "net_version",
  "web3_clientVersion",
  "web3_sha3",
] as const);
