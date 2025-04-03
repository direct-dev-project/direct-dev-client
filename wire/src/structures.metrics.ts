import type { DirectRPCRequest } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";
import { RPCRequest } from "./structures.rpc-request.js";

export type ClientMetrics = {
  samples: Array<DirectRPCRequest & { __encodedStr?: string }>;
  cacheHitCount: number;
  inflightHitCount: number;
};

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const clientMetrics = new Wire<ClientMetrics>({
  encode: (input) =>
    pack.int(input.cacheHitCount) +
    pack.int(input.inflightHitCount) +
    pack.arr(input.samples, (it) => RPCRequest.encode(it)),
  decode: (input, cursor) => {
    const cacheHitCount = unpack.int(input, cursor);
    const inflightHitCount = unpack.int(input, cacheHitCount[1]);
    const samples = unpack.arr(input, inflightHitCount[1], (cursor) => {
      const res = RPCRequest.decode(input, cursor);

      return [
        {
          ...res[0],
          __encodedStr: input.slice(cursor, res[1]),
        },
        res[1],
      ] as const;
    });

    return [
      {
        cacheHitCount: cacheHitCount[0],
        inflightHitCount: inflightHitCount[0],
        samples: samples[0],
      },
      samples[1],
    ];
  },
});
