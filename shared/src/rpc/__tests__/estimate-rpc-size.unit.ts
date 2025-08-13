import { it, expect } from "vitest";

import { asyncTimeout } from "../../utils/async.timeout.js";
import { estimateJsonRpcSize } from "../estimate-json-rpc-size.js"; // adjust path as needed

const encoder = new TextEncoder();

function actualJsonSize(obj: unknown): number {
  return encoder.encode(JSON.stringify(obj)).length;
}

it("estimates basic request size accurately (<2.5% difference)", () => {
  const req = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_blockNumber",
    params: [],
  };

  const estimate = estimateJsonRpcSize(req);
  const actual = actualJsonSize(req);

  expect(Math.abs(estimate - actual) / actual).toBeLessThan(0.025);
});

it("handles request with complex params (<2.5% difference)", () => {
  const req = {
    jsonrpc: "2.0",
    id: 42,
    method: "eth_call",
    params: [{ to: "0xabc", data: "0x123" }, "latest"],
  };

  const estimate = estimateJsonRpcSize(req);
  const actual = actualJsonSize(req);

  expect(Math.abs(estimate - actual) / actual).toBeLessThan(0.025);
});

it("handles result response (<2.5% difference)", () => {
  const res = {
    jsonrpc: "2.0",
    id: 1,
    result: "0x123456",
  };

  const estimate = estimateJsonRpcSize(res);
  const actual = actualJsonSize(res);

  expect(Math.abs(estimate - actual) / actual).toBeLessThan(0.025);
});

it("handles error response with data (<2.5% difference)", () => {
  const res = {
    jsonrpc: "2.0",
    id: 1,
    error: {
      code: -32601,
      message: "Method not found",
      data: { detail: "eth_unknownMethod" },
    },
  };

  const estimate = estimateJsonRpcSize(res);
  const actual = actualJsonSize(res);

  expect(Math.abs(estimate - actual) / actual).toBeLessThan(0.025);
});

it("handles mixed primitives in params (<2.5% difference)", () => {
  const req = {
    jsonrpc: "2.0",
    id: "abc",
    method: "test_method",
    params: [null, true, false, 123, 45.67],
  };

  const estimate = estimateJsonRpcSize(req);
  const actual = actualJsonSize(req);

  expect(Math.abs(estimate - actual) / actual).toBeLessThan(0.025);
});

it("handles deeply nested object params (<2.5% difference)", () => {
  const req = {
    jsonrpc: "2.0",
    id: 99,
    method: "deep_call",
    params: [
      {
        one: {
          two: {
            three: {
              four: "deepValue",
            },
          },
        },
      },
    ],
  };

  const estimate = estimateJsonRpcSize(req);
  const actual = actualJsonSize(req);

  expect(Math.abs(estimate - actual) / actual).toBeLessThan(0.025);
});

it("should be faster than JSON.stringify", async () => {
  const req = {
    jsonrpc: "2.0",
    id: 42,
    method: "eth_call",
    params: [{ to: "0xabc", data: "0x123" }, "latest"],
  };

  const ITERATION_COUNT = 5;
  const ITERATION_DELAY_MS = 3;
  const ITERATION_DURATION_MS = 5;

  let jsonIterations = 0;
  let estimateIterations = 0;

  for (let i = 0; i < ITERATION_COUNT; i++) {
    if (i > 0) {
      await asyncTimeout(ITERATION_DELAY_MS);
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < ITERATION_DURATION_MS) {
      actualJsonSize(req);
      jsonIterations++;
    }
  }

  for (let i = 0; i < ITERATION_COUNT; i++) {
    if (i > 0) {
      await asyncTimeout(ITERATION_DELAY_MS);
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < ITERATION_DURATION_MS) {
      estimateJsonRpcSize(req);
      estimateIterations++;
    }
  }

  expect(estimateIterations).toBeGreaterThan(jsonIterations);
});
