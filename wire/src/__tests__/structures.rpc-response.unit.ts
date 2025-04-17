import { it, expect } from "vitest";

import { sha256 } from "../hashing.sha256.js";
import { RPCResponse, type RPCResponseStructure } from "../structures.rpc-response.js";

it("should encode+decode direct_head correctly", async () => {
  const input: RPCResponseStructure = {
    predictions: [await sha256("a"), await sha256("b"), await sha256("c")],
    blockHeight: "0x01",
    blockHeightExpiresAt: null,
  };
  const encoded = RPCResponse.encode(input, null);
  const decoded = RPCResponse.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
  expect(decoded[1]).toEqual(encoded.length);
});

it("should encode+decode direct_primer correctly", () => {
  const input: RPCResponseStructure = {
    id: 1,
    result: "",
  };
  const encoded = RPCResponse.encode(input, "direct_primer");
  const decoded = RPCResponse.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
  expect(decoded[1]).toEqual(encoded.length);
});

it("should encode+decode primitive result values correctly", () => {
  const input: RPCResponseStructure = {
    id: 1,
    result: "string",
    expiresWhenBlockHeightChanges: null,
    expiresAt: null,
  };
  const encoded = RPCResponse.encode(input, null);
  const decoded = RPCResponse.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
  expect(decoded[1]).toEqual(encoded.length);
});

it("should encode+decode json result values correctly", () => {
  const input: RPCResponseStructure = {
    id: 1,
    result: { nested: "value" },
    expiresWhenBlockHeightChanges: null,
    expiresAt: null,
  };
  const encoded = RPCResponse.encode(input, null);
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
  const encoded = RPCResponse.encode(input, null);
  const decoded = RPCResponse.decode(encoded);

  expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
  expect(decoded[1]).toEqual(encoded.length);
});
