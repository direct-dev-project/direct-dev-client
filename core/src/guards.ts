import {
  isRecord,
  type DirectRPCErrorResponse,
  type DirectRPCRequest,
  type DirectRPCSuccessResponse,
} from "@direct.dev/shared";

/**
 * handcrafted type guard for RPC Requests, designed to do blazingly fast
 * validation of unknown input with zero dependencies in the client layer.
 */
export function isRpcRequest(input: unknown): input is DirectRPCRequest & { jsonrpc: string } {
  if (!isRecord(input)) {
    return false;
  }

  const idType = typeof input["id"];
  const jsonrpcType = typeof input["jsonrpc"];
  const methodType = typeof input["method"];

  if (idType !== "string" && idType !== "number") {
    return false;
  }

  if (jsonrpcType !== "string") {
    return false;
  }

  if (methodType !== "string") {
    return false;
  }

  if (typeof input["params"] !== "undefined" && !Array.isArray(input["params"])) {
    return false;
  }

  return true;
}

/**
 * handcrafted validator for success RPC Responses, designed to do blazingly
 * fast validation of unknown input with zero dependencies in the client layer.
 */
export function isRpcSuccessResponse(input: unknown): input is DirectRPCSuccessResponse {
  if (!isRecord(input)) {
    return false;
  }

  const idType = typeof input["id"];

  if (idType !== "string" && idType !== "number") {
    return false;
  }

  if (!("result" in input)) {
    return false;
  }

  if ("b" in input && input["b"] !== true) {
    return false;
  }

  if ("e" in input && typeof input["e"] !== "string") {
    return false;
  }

  return true;
}

/**
 * handcrafted validator for error RPC Responses, designed to do blazingly fast
 * validation of unknown input with zero dependencies in the client layer.
 */
export function isRpcErrorResponse(input: unknown): input is DirectRPCErrorResponse {
  if (!isRecord(input) || !isRecord(input["error"])) {
    return false;
  }

  const idType = typeof input["id"];
  const errorCodeType = typeof input["error"]["code"];
  const errorMessageType = typeof input["error"]["message"];

  if (idType !== "string" && idType !== "number") {
    return false;
  }

  if (errorCodeType !== "string" && errorCodeType !== "number") {
    return false;
  }

  if (errorMessageType !== "string") {
    return false;
  }

  return true;
}
