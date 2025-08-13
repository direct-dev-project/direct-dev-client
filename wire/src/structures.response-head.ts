import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const responseHead = new Wire<DirectRPCHead>({
  encode: (input) =>
    pack.nullableStr((input as DirectRPCHead).blockHeight) +
    pack.nullableDate((input as DirectRPCHead).blockHeightExpiresAt),
  decode: (input, cursor) => {
    const blockHeight = unpack.nullableStr(input, cursor);
    const blockHeightExpiresAt = unpack.nullableDate(input, blockHeight[1]);

    return [
      {
        blockHeight: (blockHeight[0] ?? undefined) as RPCBlockHeight | undefined,
        blockHeightExpiresAt: blockHeightExpiresAt[0],
      },
      blockHeightExpiresAt[1],
    ];
  },
});
