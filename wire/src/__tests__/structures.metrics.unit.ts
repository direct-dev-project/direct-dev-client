import { it, expect } from "vitest";

import { clientMetrics, type ClientMetrics } from "../structures.metrics.js";

it("should encode+decode client metrics correctly", () => {
  const input: ClientMetrics = {
    cacheHitCount: 1,
    inflightHitCount: 2,
    samples: [
      {
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
    ],
  };
  const encoded = clientMetrics.encode(input);
  const decoded = clientMetrics.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toMatchObject(input);
  expect(decoded[1]).toEqual(encoded.length);
});
