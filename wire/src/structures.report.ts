import type { DirectRPCRequest } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";
import { RPCRequest } from "./structures.rpc-request.js";

export type ClientReport = {
  cacheHits: Array<DirectRPCRequest & { blockHeight: string | undefined; __encodedStr?: string }>;
  inflightHits: Array<DirectRPCRequest & { blockHeight: string | undefined; __encodedStr?: string }>;
};

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const clientReport = new Wire<ClientReport>({
  encode: (input) =>
    pack.arr(input.cacheHits, (it) => (it.__encodedStr ?? RPCRequest.encode(it)) + pack.nullableStr(it.blockHeight)) +
    pack.arr(input.inflightHits, (it) => it.__encodedStr ?? RPCRequest.encode(it) + pack.nullableStr(it.blockHeight)),
  decode: (input, cursor) => {
    const cacheHits = unpack.arr(input, cursor, (cursor) => {
      const request = RPCRequest.decode(input, cursor);
      const blockHeight = unpack.nullableStr(input, request[1]);

      return [
        {
          ...request[0],
          blockHeight: blockHeight[0] ?? undefined,
          __encodedStr: input.slice(cursor, request[1]),
        },
        blockHeight[1],
      ];
    });

    const inflightHits = unpack.arr(input, cacheHits[1], (cursor) => {
      const request = RPCRequest.decode(input, cursor);
      const blockHeight = unpack.nullableStr(input, request[1]);

      return [
        {
          ...request[0],
          blockHeight: blockHeight[0] ?? undefined,
          __encodedStr: input.slice(cursor, request[1]),
        },
        blockHeight[1],
      ];
    });

    return [
      {
        cacheHits: cacheHits[0],
        inflightHits: inflightHits[0],
      },
      inflightHits[1],
    ];
  },
});
