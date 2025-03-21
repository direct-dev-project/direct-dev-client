import type { DirectRPCRequest } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

/**
 * implementation of WirePackers for common eth request signatures
 *
 * @todo (Mads, 20-03-2025): finalize implementations for frequently used
 *       requests
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ethRequest = new Wire<DirectRPCRequest & { params?: any; __overrideBlockHeight?: string }>(
  {
    eth_blockNumber: {
      id: "0",
      encode: (input) => pack.strOrNum(input.id),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);

        return {
          id: id[0],
          method: "eth_blockNumber",
        };
      },
    },
    eth_call: {
      id: "1",
      encode: (input) =>
        pack.strOrNum(input.id) +
        pack.str(input.params[0].to) +
        pack.nullableStr(input.params[0].from) +
        pack.nullableStr(input.params[0].data) +
        pack.nullableStr(input.__overrideBlockHeight ?? input.params[1]),
      decode: (input, cursor) => {
        const id = unpack.strOrNum(input, cursor);
        const to = unpack.str(input, id[1]);
        const from = unpack.nullableStr(input, to[1]);
        const data = unpack.nullableStr(input, from[1]);
        const blockHeight = unpack.nullableStr(input, data[1]);

        return {
          method: "eth_call",
          id: id[0],
          params: [
            {
              to: to[0],
              from: from[0],
              data: data[0],
            },
            blockHeight[0],
          ],
        };
      },
    },
  },
  (input) => {
    return input.method;
  },
);

export function hashEthRequest(req: DirectRPCRequest & { __overrideBlockHeight?: string }): Promise<string> {
  return ethRequest.hash({ ...req, id: "" });
}
