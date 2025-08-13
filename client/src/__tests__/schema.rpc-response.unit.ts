import { it, expect } from "vitest";

import { rpcResponseSchema } from "../schemas.js";

it("parses valid response", () => {
  const input = { id: 1, result: { foo: true }, jsonrpc: "2.0" };
  const output = rpcResponseSchema(input);

  expect(output).toEqual(expect.objectContaining({ id: 1, result: { foo: true } }));
});

it("parses with expiresAt as Date", () => {
  const now = new Date();
  const input = { id: 1, result: "ok", expiresAt: now };
  const output = rpcResponseSchema(input);

  expect((output as DirectRPCResultResponse).expiresAt).toBeInstanceOf(Date);
});

it("parses with expiresAt as string", () => {
  const input = { id: 1, result: "ok", expiresAt: new Date().toISOString() };
  const output = rpcResponseSchema(input);

  expect((output as DirectRPCResultResponse).expiresAt).toBeInstanceOf(Date);
});

it("throws if expiresAt is malformed", () => {
  expect(() => rpcResponseSchema({ id: 1, result: "x", expiresAt: 42 })).toThrow(/expiresAt/);
});

it("parses valid error response", () => {
  const input = {
    id: 1,
    error: {
      code: -32601,
      message: "Method not found",
    },
  };
  const output = rpcResponseSchema(input);

  expect((output as DirectRPCErrorResponse).error.code).toBe(-32601);
  expect((output as DirectRPCErrorResponse).error.message).toBe("Method not found");
});

it("includes optional data", () => {
  const input = {
    id: 1,
    error: {
      code: -32600,
      message: "Invalid request",
      data: { details: true },
    },
  };
  const output = rpcResponseSchema(input);

  expect((output as DirectRPCErrorResponse).error.data).toEqual({ details: true });
});

it("throws if code is not number", () => {
  expect(() => rpcResponseSchema({ id: 1, error: { code: "x", message: "fail" } })).toThrow(/code/);
});

it("throws if message is not string", () => {
  expect(() => rpcResponseSchema({ id: 1, error: { code: 1, message: {} } })).toThrow(
    /rpcResponse.error.message must be a string/,
  );
});

it("throws if id is invalid", () => {
  expect(() => rpcResponseSchema({ id: {}, result: "x" })).toThrow(/rpcResponse did not match any union type/);
});

it("throws if result and error is missing", () => {
  expect(() => rpcResponseSchema({ id: 1 })).toThrow(/rpcResponse did not match any union type/);
});
