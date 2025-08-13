import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RequestHead = {
  sessionId: string;
  supportsCompression?: boolean;
  blockHeight?: RPCBlockHeight;
};

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const requestHead = new Wire<RequestHead>({
  encode: (input) =>
    pack.str(input.sessionId) + pack.bool(!!input.supportsCompression) + pack.nullableStr(input.blockHeight),
  decode: (input, cursor) => {
    const sessionId = unpack.str(input, cursor);
    const supportsCompression = unpack.bool(input, sessionId[1]);
    const blockHeight = unpack.nullableStr(input, supportsCompression[1]);

    return [
      {
        sessionId: sessionId[0],
        supportsCompression: supportsCompression[0],
        blockHeight: (blockHeight[0] as RPCBlockHeight) ?? undefined,
      },
      blockHeight[1],
    ];
  },
});
