/**
 * tiny utility to estimate the size of JSON-RPC objects, used to estimate
 * bandwidth consumption of requests made without Direct.dev in place
 */
export function estimateJsonRpcSize(
  input: MaybeArray<DirectRPCRequest | DirectRPCResultResponse | DirectRPCErrorResponse | undefined>,
): number {
  if (Array.isArray(input)) {
    const len = input.length;
    let size = ARRAY_OVERHEAD + len - 1;

    for (let i = 0; i < len; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      size += estimateObjectSize(input[i]!);
    }

    return size;
  }

  return estimateObjectSize(input);
}

function estimateObjectSize(
  input: DirectRPCRequest | DirectRPCResultResponse | DirectRPCErrorResponse | undefined,
): number {
  if (input === undefined) {
    return 0;
  }

  //
  // DirectRPCResultResponse
  //
  if ("result" in input) {
    let size = RESULT_RESPONSE_OVERHEAD;

    size += String(input.id).length;
    size += estimateJsonSize(input.result);

    return size;
  }

  //
  // DirectRPCErrorResponse
  //
  if ("error" in input) {
    let size = ERROR_RESPONSE_OVERHEAD;

    size += String(input.id).length;
    size += String(input.error.code).length;
    size += String(input.error.message).length;
    size += input.error.data ? ERROR_DATA_OVERHEAD + estimateJsonSize(input.error.data) : 0;

    return size;
  }

  //
  // DirectRPCRequest
  //
  let size = REQUEST_OVERHEAD;

  size += input.method.length;
  size += String(input.id).length;
  size += estimateJsonSize(input.params);

  return size;
}

/**
 * tiny utility to estimate JSON encoded size of an unknown input
 */
function estimateJsonSize(input: unknown): number {
  // fast path for literals
  if (input === null) {
    return 4;
  }
  if (input === true) {
    return 4;
  }
  if (input === false) {
    return 5;
  }

  if (typeof input === "number" || typeof input === "bigint") {
    return String(input).length;
  }
  if (typeof input === "string") {
    return input.length + STRING_OVERHEAD;
  }

  if (Array.isArray(input)) {
    const len = input.length;

    if (len === 0) {
      return ARRAY_OVERHEAD;
    }

    let size = ARRAY_OVERHEAD + len - 1;

    for (let i = 0; i < len; i++) {
      size += estimateJsonSize(input[i]);
    }

    return size;
  }

  if (typeof input === "object" && input !== null) {
    const entries = Object.entries(input);
    const len = entries.length;

    if (len === 0) {
      return OBJECT_OVERHEAD;
    }

    let size = OBJECT_OVERHEAD + OBJECT_PROPERTY_OVERHEAD * len - 1;

    for (let i = 0; i < len; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      size += entries[i]![0].length + estimateJsonSize(entries[i]![1]);
    }

    return size;
  }

  return 0;
}

const REQUEST_OVERHEAD = `{"jsonrpc":"2.0","id":,"method":"","params":}`.length;
const RESULT_RESPONSE_OVERHEAD = `{"jsonrpc":"2.0","id":,"result":}`.length;
const ERROR_RESPONSE_OVERHEAD = `{"jsonrpc":"2.0","id":,"error":{"code":,"message":""}}`.length;
const ERROR_DATA_OVERHEAD = `,"data":`.length;

const ARRAY_OVERHEAD = `[]`.length;
const OBJECT_OVERHEAD = `{}`.length;
const OBJECT_PROPERTY_OVERHEAD = `"":,`.length;
const STRING_OVERHEAD = `""`.length;
