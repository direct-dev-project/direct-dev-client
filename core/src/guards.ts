import {
  isRecord,
  type DirectRPCErrorResponse,
  type DirectRPCRequest,
  type DirectRPCSuccessResponse,
  type RPCRequestHash,
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

  if (!Array.isArray(input["params"])) {
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

export type DirectRPCHead = {
  /**
   * array of RPCRequestHashes that have been predicted for subsequent
   * requests, and which will be included within the batch automatically.
   */
  p: RPCRequestHash[];

  /**
   * the currently known block height from within the mirror, at the time of
   * receiving the request.
   */
  b?: string;

  /**
   * timestamp for expiration of the currently known block height, which lets
   * the client know for how long it can return responses that are tied to this
   * block.
   */
  e?: string;
};

/**
 * handcrafted validator for Direct.dev response heads, designed to do
 * blazingly fast validation of unknown input with zero dependencies in the
 * client layer.
 */
export function isDirectRPCHead(input: unknown): input is DirectRPCHead {
  if (!isRecord(input)) {
    return false;
  }

  if (!Array.isArray(input["p"]) || input["p"].some((it) => typeof it !== "string")) {
    return false;
  }

  if ("b" in input && typeof input["b"] !== "string") {
    return false;
  }

  if ("e" in input && typeof input["e"] !== "string") {
    return false;
  }

  return true;
}
