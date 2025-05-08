import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

export type RequestHead = {
  sessionId: string;
};

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const requestHead = new Wire<RequestHead>({
  encode: (input) => pack.str(input.sessionId),
  decode: (input, cursor) => {
    const sessionId = unpack.str(input, cursor);

    return [
      {
        sessionId: sessionId[0],
      },
      sessionId[1],
    ];
  },
});
