import { it, expect } from "vitest";

import { rpcRequestSchema } from "../schemas.js";

it("parses a valid request", () => {
  const input = { id: 1, method: "getBlock", jsonrpc: "2.0" };
  const result = rpcRequestSchema(input);
  expect(result).toEqual(input);
});

it("parses with optional params", () => {
  const input = { id: "abc", method: "foo", jsonrpc: "2.0", params: { x: 1 } };
  expect(rpcRequestSchema(input).params).toEqual({ x: 1 });
});

it("parses when params is null", () => {
  const input = { id: "x", method: "test", jsonrpc: "2.0", params: null };
  expect(rpcRequestSchema(input).params).toBeNull();
});

it("throws if method is missing", () => {
  expect(() => rpcRequestSchema({ id: 1, jsonrpc: "2.0" })).toThrow(/rpcRequest.method is required/);
});

it("throws if method is not string", () => {
  expect(() => rpcRequestSchema({ id: 1, method: 42, jsonrpc: "2.0" })).toThrow(/rpcRequest.method must be a string/);
});

it("throws if id is invalid", () => {
  expect(() => rpcRequestSchema({ id: {}, method: "foo", jsonrpc: "2.0" })).toThrow(
    /rpcRequest.id must be string or number/,
  );
});

it("throws if jsonrpc is missing", () => {
  expect(() => rpcRequestSchema({ id: 1, method: "foo" })).toThrow(/rpcRequest.jsonrpc is required/);
});

it("throws if input is not a record", () => {
  expect(() => rpcRequestSchema(null)).toThrow(/must be a record/);
  expect(() => rpcRequestSchema(42)).toThrow(/must be a record/);
});
