import type { DirectRPCErrorResponse, DirectRPCSuccessResponse, DirectRPCHead } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RPCResponseStructure = DirectRPCSuccessResponse | DirectRPCErrorResponse | DirectRPCHead;

/**
 * implementation of WirePackers for common eth response signatures
 */
export const RPCResponse = new Wire<
  RPCResponseStructure,
  | [requestMethod: string | null | undefined]
  | [requestMethod: string | null | undefined, options: { compress: boolean }]
>(
  {
    //
    // Direct.dev proprietary response structures
    //

    direct_head: {
      id: 1,
      encode: (input) =>
        pack.arr((input as DirectRPCHead).predictions, (it) => pack.sha256(it)) +
        pack.nullableStr((input as DirectRPCHead).blockHeight) +
        pack.nullableDate((input as DirectRPCHead).blockHeightExpiresAt),
      decode: (input, cursor) => {
        const predictions = unpack.arr(input, cursor, (cursor) => unpack.sha256(input, cursor));
        const blockHeight = unpack.nullableStr(input, predictions[1]);
        const blockHeightExpiresAt = unpack.nullableDate(input, blockHeight[1]);

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
      id: 2,
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

    rpc_success__compressed: {
      id: 3,
      encode: (input) =>
        pack.strOrNum((input as DirectRPCSuccessResponse).id) +
        pack.nullableBool((input as DirectRPCSuccessResponse).expiresWhenBlockHeightChanges) +
        pack.nullableDate((input as DirectRPCSuccessResponse).expiresAt) +
        pack.rleStr((input as DirectRPCSuccessResponse).result as string),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const expiresWhenBlockHeightChanges = unpack.nullableBool(input, id[1]);
        const expiresAt = unpack.nullableDate(input, expiresWhenBlockHeightChanges[1]);
        const result = unpack.rleStr(input, expiresAt[1]);

        return [
          {
            id: id[0],
            result: result[0],
            expiresWhenBlockHeightChanges: expiresWhenBlockHeightChanges[0],
            expiresAt: expiresAt[0],
          },
          result[1],
        ];
      },
    },

    rpc_success__primitive: {
      id: 4,
      encode: (input) =>
        pack.strOrNum((input as DirectRPCSuccessResponse).id) +
        pack.nullableBool((input as DirectRPCSuccessResponse).expiresWhenBlockHeightChanges) +
        pack.nullableDate((input as DirectRPCSuccessResponse).expiresAt) +
        pack.primitive((input as DirectRPCSuccessResponse).result as string),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const expiresWhenBlockHeightChanges = unpack.nullableBool(input, id[1]);
        const expiresAt = unpack.nullableDate(input, expiresWhenBlockHeightChanges[1]);
        const result = unpack.primitive(input, expiresAt[1]);

        return [
          {
            id: id[0],
            result: result[0],
            expiresWhenBlockHeightChanges: expiresWhenBlockHeightChanges[0],
            expiresAt: expiresAt[0],
          },
          result[1],
        ];
      },
    },

    rpc_success__json: {
      id: 5,
      encode: (input) =>
        pack.strOrNum((input as DirectRPCSuccessResponse).id) +
        pack.nullableBool((input as DirectRPCSuccessResponse).expiresWhenBlockHeightChanges) +
        pack.nullableDate((input as DirectRPCSuccessResponse).expiresAt) +
        pack.json((input as DirectRPCSuccessResponse).result),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const expiresWhenBlockHeightChanges = unpack.nullableBool(input, id[1]);
        const expiresAt = unpack.nullableDate(input, expiresWhenBlockHeightChanges[1]);
        const result = unpack.json(input, expiresAt[1]);

        return [
          {
            id: id[0],
            result: result[0],
            expiresWhenBlockHeightChanges: expiresWhenBlockHeightChanges[0],
            expiresAt: expiresAt[0],
          },
          result[1],
        ];
      },
    },

    rpc_error: {
      id: 6,
      encode: (input) =>
        pack.strOrNum((input as DirectRPCErrorResponse).id) +
        pack.num((input as DirectRPCErrorResponse).error.code) +
        pack.str((input as DirectRPCErrorResponse).error.message) +
        pack.json((input as DirectRPCErrorResponse).error.data),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const code = unpack.num(input, id[1]);
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
  },
  (input, [requestMethod, options]) => {
    if ("result" in input) {
      switch (requestMethod) {
        case "direct_primer":
          return requestMethod;

        default:
          switch (typeof input.result) {
            case "string":
              return options?.compress ? "rpc_success__compressed" : "rpc_success__primitive";

            case "bigint":
            case "boolean":
            case "number":
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
