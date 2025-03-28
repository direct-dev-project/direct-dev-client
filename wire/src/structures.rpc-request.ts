import type { DirectRPCRequest } from "@direct.dev/shared";

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
export const RPCRequest = new Wire<RPCRequestStructure>(
  {
    direct_primer: {
      id: "0",
      encode: (input) => pack.strOrNum(input.id) + pack.nullableStr(input.params[0]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const context = unpack.nullableStr(input, id[1]);

        return [
          {
            id: id[0],
            method: "direct_primer",
            params: [context[0]],
          },
          context[1],
        ];
      },
    },

    eth_blockNumber: {
      id: "1",
      encode: (input) => pack.strOrNum(input.id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return [
          {
            id: id[0],
            method: "eth_blockNumber",
          },
          id[1],
        ];
      },
    },

    eth_call: {
      id: "2",
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
        pack.nullableStr(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const toParam = unpack.str(input, id[1]);
        const fromParam = unpack.nullableStr(input, toParam[1]);
        const dataParam = unpack.nullableStr(input, fromParam[1]);
        const inputParam = unpack.nullableStr(input, dataParam[1]);
        const valueParam = unpack.nullableStr(input, inputParam[1]);
        const gasParam = unpack.nullableStr(input, valueParam[1]);
        const gasPriceParam = unpack.nullableStr(input, gasParam[1]);
        const blockHeight = unpack.nullableStr(input, gasPriceParam[1]);

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

    eth_chainId: {
      id: "3",
      encode: (input) => pack.strOrNum(input.id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return [
          {
            id: id[0],
            method: "eth_chainId",
          },
          id[1],
        ];
      },
    },

    eth_gasPrice: {
      id: "4",
      encode: (input) => pack.strOrNum(input.id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return [
          {
            id: id[0],
            method: "eth_gasPrice",
          },
          id[1],
        ];
      },
    },

    /**
     * @todo (Mads): determine which calls to include handling for
     * ```ts
     * eth_getBalance: readonly [RPCAddressValue, RPCBlockHeightParam];
     * eth_getBlockByHash: readonly [RPCHashValue, boolean];
     * eth_getBlockByNumber: readonly [RPCBlockHeightParam, boolean];
     * eth_getBlockTransactionCountByHash: readonly [RPCHashValue];
     * eth_getBlockTransactionCountByNumber: readonly [RPCBlockHeightParam];
     * eth_getCode: readonly [RPCAddressValue, RPCBlockHeightParam];
     * eth_getStorageAt: readonly [RPCAddressValue, RPCQuantityValue, RPCBlockHeightParam];
     * eth_getTransactionByBlockHashAndIndex: readonly [RPCHashValue, RPCQuantityValue];
     * eth_getTransactionByBlockNumberAndIndex: readonly [RPCBlockHeightParam, RPCQuantityValue];
     * eth_getTransactionByHash: readonly [RPCHashValue];
     * eth_getTransactionCount: readonly [RPCAddressValue, RPCBlockHeightParam];
     * eth_getTransactionReceipt: readonly [RPCHashValue];
     * eth_getUncleByBlockHashAndIndex: readonly [RPCHashValue, RPCQuantityValue];
     * eth_getUncleByBlockNumberAndIndex: readonly [RPCBlockHeightParam, RPCQuantityValue];
     * eth_getUncleCountByBlockHash: readonly [RPCHashValue];
     * eth_getUncleCountByBlockNumber: readonly [RPCBlockHeightParam];
     * ```
     **/
  },
  (input) => {
    return input.method;
  },
);

/**
 * blazingly fast and consistent hasher for ETH requests, which consistently
 * provides the same hash regardless of request ID and property ordering
 */
export function hashRPCRequest(
  req: Omit<RPCRequestStructure, "id"> & { id?: string | number },
  encodedStr?: string,
): Promise<string> {
  if (encodedStr !== undefined) {
    return RPCRequest.hash(
      { ...req, id: "" },
      encodedStr.charAt(0) + pack.str("") + encodedStr.slice(unpack.strOrNum(encodedStr, 1)[1]),
    );
  }

  return RPCRequest.hash({ ...req, id: "" });
}
