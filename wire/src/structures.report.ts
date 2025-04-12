import type { DirectRPCRequest } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";
import { RPCRequest } from "./structures.rpc-request.js";

export type ClientReport = {
  cacheHits: Array<DirectRPCRequest & { __encodedStr?: string }>;
  inflightHits: Array<DirectRPCRequest & { __encodedStr?: string }>;
};

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const clientReport = new Wire<ClientReport>({
  encode: (input) =>
    pack.arr(input.cacheHits, (it) => it.__encodedStr ?? RPCRequest.encode(it)) +
    pack.arr(input.inflightHits, (it) => it.__encodedStr ?? RPCRequest.encode(it)),
  decode: (input, cursor) => {
    const cacheHits = unpack.arr(input, cursor, (cursor) => {
      const request = RPCRequest.decode(input, cursor);

      return [
        {
          ...request[0],
          __encodedStr: input.slice(cursor, request[1]),
        },
        request[1],
      ];
    });

    const inflightHits = unpack.arr(input, cacheHits[1], (cursor) => {
      const request = RPCRequest.decode(input, cursor);

      return [
        {
          ...request[0],
          __encodedStr: input.slice(cursor, request[1]),
        },
        request[1],
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
