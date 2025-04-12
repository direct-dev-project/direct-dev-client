import { it, expect } from "vitest";

import { clientReport, type ClientReport } from "../structures.report.js";

it("should encode+decode client metrics correctly", () => {
  const input: ClientReport = {
    cacheHits: [
      {
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
    ],
    inflightHits: [
      {
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
    ],
  };
  const encoded = clientReport.encode(input);
  const decoded = clientReport.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toMatchObject(input);
  expect(decoded[1]).toEqual(encoded.length);
});
