import type { DirectRPCHead } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const responseHead = new Wire<DirectRPCHead>({
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
});
