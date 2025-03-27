import type { DirectRPCErrorResponse, DirectRPCSuccessResponse, DirectRPCHead } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RPCResponseStructure = DirectRPCSuccessResponse | DirectRPCErrorResponse | DirectRPCHead;

/**
 * implementation of WirePackers for common eth response signatures
 *
 * @todo (Mads, 20-03-2025): finalize implementations for frequently used
 *       requests
 */
export const RPCResponse = new Wire<RPCResponseStructure, [requestMethod: string | null | undefined]>(
  {
    //
    // Direct.dev proprietary response structures
    //

    direct_head: {
      id: "0",
      encode: (input) =>
        pack.arr((input as DirectRPCHead).predictions, (it) => pack.str(it)) +
        pack.nullableStr((input as DirectRPCHead).blockHeight) +
        pack.nullableStr((input as DirectRPCHead).blockHeightExpiresAt),
      decode: (input, cursor) => {
        const predictions = unpack.arr(input, cursor, (cursor) => unpack.str(input, cursor));
        const blockHeight = unpack.nullableStr(input, predictions[1]);
        const blockHeightExpiresAt = unpack.nullableStr(input, blockHeight[1]);

        return [
          {
            predictions: predictions[0],
            blockHeight: blockHeight[0],
            blockHeightExpiresAt: blockHeightExpiresAt[0],
          },
          blockHeightExpiresAt[1],
        ];
      },
    },

    direct_primer: {
      id: "1",
      encode: (input) => pack.strOrNum((input as DirectRPCSuccessResponse).id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return [
          {
            id: id[0],
            result: "",
          },
          id[1],
        ];
      },
    },

    //
    // generic fallbacks if we do not yet have optimized packers implemented for
    // the specific responses
    //

    rpc_success__primitive: {
      id: "2",
      encode: (input) =>
        pack.strOrNum((input as DirectRPCSuccessResponse).id) +
        pack.bool((input as DirectRPCSuccessResponse).expiresWhenBlockHeightChanges ?? false) +
        pack.nullableStr((input as DirectRPCSuccessResponse).expiresAt) +
        pack.primitive((input as DirectRPCSuccessResponse).result as string),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const expiresWhenBlockHeightChanges = unpack.bool(input, id[1]);
        const expiresAt = unpack.nullableStr(input, expiresWhenBlockHeightChanges[1]);
        const result = unpack.primitive(input, expiresAt[1]);

        return [
          {
            id: id[0],
            result: result[0],
            expiresWhenBlockHeightChanges: expiresWhenBlockHeightChanges[0],
            expiresAt: expiresAt[0],
          },
          expiresAt[1],
        ];
      },
    },

    rpc_success__json: {
      id: "3",
      encode: (input) =>
        pack.strOrNum((input as DirectRPCSuccessResponse).id) +
        pack.bool((input as DirectRPCSuccessResponse).expiresWhenBlockHeightChanges ?? false) +
        pack.nullableStr((input as DirectRPCSuccessResponse).expiresAt) +
        pack.json((input as DirectRPCSuccessResponse).result),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const expiresWhenBlockHeightChanges = unpack.bool(input, id[1]);
        const expiresAt = unpack.nullableStr(input, expiresWhenBlockHeightChanges[1]);
        const result = unpack.json(input, expiresAt[1]);

        return [
          {
            id: id[0],
            result: result[0],
            expiresWhenBlockHeightChanges: expiresWhenBlockHeightChanges[0],
            expiresAt: expiresAt[0],
          },
          expiresAt[1],
        ];
      },
    },

    rpc_error: {
      id: "4",
      encode: (input) =>
        pack.strOrNum((input as DirectRPCErrorResponse).id) +
        pack.strOrNum((input as DirectRPCErrorResponse).error.code) +
        pack.str((input as DirectRPCErrorResponse).error.message) +
        pack.json((input as DirectRPCErrorResponse).error.data),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const code = unpack.strOrNum(input, id[1]);
        const message = unpack.str(input, code[1]);
        const json = unpack.json(input, message[1]);

        return [
          {
            id: id[0],
            error: {
              code: code[0],
              message: message[0],
              data: json[0],
            },
          },
          json[1],
        ];
      },
    },

    /**
     * @todo (Mads): determine which calls to include handling for
     * ```ts
     * eth_blockNumber: {
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
  (input, [requestMethod]) => {
    if ("result" in input) {
      switch (requestMethod) {
        case "direct_primer":
          return requestMethod;

        default:
          switch (typeof input.result) {
            case "bigint":
            case "boolean":
            case "number":
            case "string":
            case "undefined":
              return "rpc_success__primitive";

            case "symbol":
            case "object":
            case "function":
              return input.result != null ? "rpc_success__json" : "rpc_success__primitive";
          }
      }
    }

    if ("predictions" in input) {
      return "direct_head";
    }

    if ("error" in input) {
      return "rpc_error";
    }
  },
);
