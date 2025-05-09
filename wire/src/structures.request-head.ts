import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RequestHead = {
  sessionId: string;
  blockHeight?: string;
};

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const requestHead = new Wire<RequestHead>({
  encode: (input) => pack.str(input.sessionId) + pack.nullableStr(input.blockHeight),
  decode: (input, cursor) => {
    const sessionId = unpack.str(input, cursor);
    const blockHeight = unpack.nullableStr(input, sessionId[1]);

    return [
      {
        sessionId: sessionId[0],
        blockHeight: blockHeight[0] ?? undefined,
      },
      blockHeight[1],
    ];
  },
});
