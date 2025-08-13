import { it, expect } from "vitest";

import { RPCResponse, type RPCResponseStructure } from "../structures.rpc-response.js";

it("should encode+decode primitive result values correctly", () => {
  const input: RPCResponseStructure = {
    id: 1,
    result: "string",
  };
  const encoded = RPCResponse.encode(input, { requestMethod: undefined });
  const decoded = RPCResponse.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
  expect(decoded[1]).toEqual(encoded.length);
});

it("should encode+decode json result values correctly", () => {
  const input: RPCResponseStructure = {
    id: 1,
    result: { nested: "value" },
  };
  const encoded = RPCResponse.encode(input, { requestMethod: undefined });
  const decoded = RPCResponse.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
  expect(decoded[1]).toEqual(encoded.length);
});

it("should encode+decode errors correctly", () => {
  const input: RPCResponseStructure = {
    id: 1,
    error: {
      code: 123,
      message: "abc",
    },
  };
  const encoded = RPCResponse.encode(input, { requestMethod: undefined });
  const decoded = RPCResponse.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
  expect(decoded[1]).toEqual(encoded.length);
});
