import { it, expect } from "vitest";

import { requestTail, type RequestTail } from "../structures.request-tail.js";

it("should encode+decode client metrics correctly", () => {
  const input: RequestTail = {
    cacheHits: [
      {
        timestamp: new Date(),
        blockHeight: "0x1",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
    ],
    prefetchHits: [
      {
        timestamp: new Date(),
        blockHeight: "0x2",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
    ],
    inflightHits: [
      {
        timestamp: new Date(),
        blockHeight: "0x3",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
    ],
  };
  const encoded = requestTail.encode(input);
  const decoded = requestTail.decode(encoded);

  expect(decoded[0]).toMatchObject(input);
  expect(decoded[1]).toEqual(encoded.length);
});
