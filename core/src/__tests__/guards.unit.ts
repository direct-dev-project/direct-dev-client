import { describe, it, expect } from "vitest";

import { isRpcRequest, isRpcSuccessResponse, isRpcErrorResponse, isDirectRPCHead } from "../guards.js";

describe("isRpcRequest", () => {
  it("should validate a correct RPC request", () => {
    expect(isRpcRequest({ id: 1, jsonrpc: "2.0", method: "test", params: [] })).toBe(true);
  });

  it("should reject an RPC request missing required properties", () => {
    expect(isRpcRequest({ jsonrpc: "2.0", method: "test", params: [] })).toBe(false);
    expect(isRpcRequest({ id: 1, method: "test", params: [] })).toBe(false);
    expect(isRpcRequest({ id: 1, jsonrpc: "2.0", params: [] })).toBe(false);
  });

  it("should reject an RPC request with incorrect property types", () => {
    expect(isRpcRequest({ id: true, jsonrpc: "2.0", method: "test", params: [] })).toBe(false);
    expect(isRpcRequest({ id: 1, jsonrpc: 2.0, method: "test", params: [] })).toBe(false);
    expect(isRpcRequest({ id: 1, jsonrpc: "2.0", method: 123, params: [] })).toBe(false);
    expect(isRpcRequest({ id: 1, jsonrpc: "2.0", method: "test", params: "not an array" })).toBe(false);
  });
});

describe("isRpcSuccessResponse", () => {
  it("should validate a correct RPC success response", () => {
    expect(isRpcSuccessResponse({ id: 1, result: "data" })).toBe(true);
  });

  it("should reject an RPC success response missing required properties", () => {
    expect(isRpcSuccessResponse({ id: 1 })).toBe(false);
    expect(isRpcSuccessResponse({ result: "data" })).toBe(false);
  });

  it("should reject an RPC success response with incorrect property types", () => {
    expect(isRpcSuccessResponse({ id: true, result: "data" })).toBe(false);
  });
});

describe("isRpcErrorResponse", () => {
  it("should validate a correct RPC error response", () => {
    expect(isRpcErrorResponse({ id: 1, error: { code: 500, message: "Error occurred" } })).toBe(true);
  });

  it("should reject an RPC error response missing required properties", () => {
    expect(isRpcErrorResponse({ id: 1 })).toBe(false);
    expect(isRpcErrorResponse({ id: 1, error: { message: "Error occurred" } })).toBe(false);
    expect(isRpcErrorResponse({ id: 1, error: { code: 500 } })).toBe(false);
    expect(isRpcErrorResponse({ error: { code: 500, message: "Error occurred" } })).toBe(false);
  });

  it("should reject an RPC error response with incorrect property types", () => {
    expect(isRpcErrorResponse({ id: true, error: { code: 500, message: "Error occurred" } })).toBe(false);
    expect(isRpcErrorResponse({ id: 1, error: "not an object" })).toBe(false);
    expect(isRpcErrorResponse({ id: 1, error: { code: true, message: "Error occurred" } })).toBe(false);
    expect(isRpcErrorResponse({ id: 1, error: { code: 500, message: 123 } })).toBe(false);
  });
});

describe("isDirectRPCHead", () => {
  it("should validate a correct DirectRPCHead", () => {
    expect(isDirectRPCHead({ p: ["hash1", "hash2"], b: "123", e: "456" })).toBe(true);
  });

  it("should reject a DirectRPCHead missing required properties", () => {
    expect(isDirectRPCHead({ b: "123", e: "456" })).toBe(false);
  });

  it("should reject a DirectRPCHead with incorrect property types", () => {
    expect(isDirectRPCHead({ p: "not an array", b: "123", e: "456" })).toBe(false);
    expect(isDirectRPCHead({ p: [123, "hash2"], b: "123", e: "456" })).toBe(false);
    expect(isDirectRPCHead({ p: ["hash1", "hash2"], b: 123, e: "456" })).toBe(false);
    expect(isDirectRPCHead({ p: ["hash1", "hash2"], b: "123", e: 456 })).toBe(false);
  });
});
