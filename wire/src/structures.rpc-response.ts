import { sortObject, hash } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RPCResponseStructure = DirectRPCResultResponse | DirectRPCErrorResponse;

type RPCResponseOptions = {
  /**
   * if possible, provide the method of the original request in order to allow
   * compacting response structure as much as possible.
   */
  requestMethod: DirectRequestMethod | null | undefined;

  /**
   * optionally provide a pre-encoded version of the response, which will be
   * used if compatible with other configuration options.
   */
  preEncoded?: string | null | undefined;
};

/**
 * implementation of WirePackers for common eth response signatures
 */
export const RPCResponse = new Wire<RPCResponseStructure, [options: RPCResponseOptions]>(
  {
    //
    // generic fallbacks if we do not yet have optimized packers implemented for
    // the specific responses
    //

    rpc_success__primitive: {
      id: 1,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.nullableDate((input as DirectRPCResultResponse).expiresAt) +
        pack.primitive((input as DirectRPCResultResponse).result as string),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const expiresAt = unpack.nullableDate(input, id[1]);
        const result = unpack.primitive(input, expiresAt[1]);

        return [
          {
            id: id[0],
            expiresAt: expiresAt[0] ?? undefined,
            result: result[0],
          },
          result[1],
        ];
      },
    },

    rpc_success__json: {
      id: 2,
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.nullableDate((input as DirectRPCResultResponse).expiresAt) +
        pack.json((input as DirectRPCResultResponse).result),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const expiresAt = unpack.nullableDate(input, id[1]);
        const result = unpack.json(input, expiresAt[1]);

        return [
          {
            id: id[0],
            expiresAt: expiresAt[0] ?? undefined,
            result: result[0],
          },
          result[1],
        ];
      },
    },

    rpc_error: {
      id: 3,
      encode: (input) =>
        pack.strOrNum(input.id) +
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
  (input, [options]) => {
    if (options.preEncoded) {
      return {
        preEncoded: options.preEncoded,
      };
    }

    if ("result" in input) {
      switch (typeof input.result) {
        case "string":
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

    if ("error" in input) {
      return "rpc_error";
    }
  },
);

/**
 * consistent hasher for responses, which gracefully andles scrambled property
 * ordering and generates consistent hashes regardless of request ID.
 */
export function hashRPCResponse(input: RPCResponseStructure): DirectResponseHash {
  return hash(
    sortObject(
      "result" in input
        ? {
            result: input.result,
          }
        : {
            error: input.error,
          },
    ),
  ) as DirectResponseHash;
}
