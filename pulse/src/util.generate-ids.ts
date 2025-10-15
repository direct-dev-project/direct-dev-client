/**
 * Generate a random 16-byte trace ID compatible with OTLP
 */
export function generateTraceId() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * blazingly fast string encoder of traceId
 */
export function encodeTraceId(b: Uint8Array) {
  if (BINARY_TO_HEX === undefined) {
    BINARY_TO_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  }

  // unrolled manually for 16 bytes
  return (
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    BINARY_TO_HEX[b[0]!]! +
    BINARY_TO_HEX[b[1]!] +
    BINARY_TO_HEX[b[2]!] +
    BINARY_TO_HEX[b[3]!] +
    BINARY_TO_HEX[b[4]!] +
    BINARY_TO_HEX[b[5]!] +
    BINARY_TO_HEX[b[6]!] +
    BINARY_TO_HEX[b[7]!] +
    BINARY_TO_HEX[b[8]!] +
    BINARY_TO_HEX[b[9]!] +
    BINARY_TO_HEX[b[10]!] +
    BINARY_TO_HEX[b[11]!] +
    BINARY_TO_HEX[b[12]!] +
    BINARY_TO_HEX[b[13]!] +
    BINARY_TO_HEX[b[14]!] +
    BINARY_TO_HEX[b[15]!]
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  );
}

/**
 * blazingly string string decoder for traceId
 */
export function decodeTraceId(payload: string): Uint8Array {
  if (HEX_TO_BINARY === undefined) {
    HEX_TO_BINARY = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [i.toString(16).padStart(2, "0"), i]));
  }

  // unrolled manually for 16 bytes
  return new Uint8Array([
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    HEX_TO_BINARY[payload.slice(0, 2)]!,
    HEX_TO_BINARY[payload.slice(2, 4)]!,
    HEX_TO_BINARY[payload.slice(4, 6)]!,
    HEX_TO_BINARY[payload.slice(6, 8)]!,
    HEX_TO_BINARY[payload.slice(8, 10)]!,
    HEX_TO_BINARY[payload.slice(10, 12)]!,
    HEX_TO_BINARY[payload.slice(12, 14)]!,
    HEX_TO_BINARY[payload.slice(14, 16)]!,
    HEX_TO_BINARY[payload.slice(16, 18)]!,
    HEX_TO_BINARY[payload.slice(18, 20)]!,
    HEX_TO_BINARY[payload.slice(20, 22)]!,
    HEX_TO_BINARY[payload.slice(22, 24)]!,
    HEX_TO_BINARY[payload.slice(24, 26)]!,
    HEX_TO_BINARY[payload.slice(26, 28)]!,
    HEX_TO_BINARY[payload.slice(28, 30)]!,
    HEX_TO_BINARY[payload.slice(30, 32)]!,
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  ]);
}

/**
 * Generate a random 8-byte span ID compatible with OTLP
 */
export function generateSpanId() {
  return crypto.getRandomValues(new Uint8Array(8));
}

/**
 * blazingly fast string encoder of spanId
 */
export function encodeSpanId(b: Uint8Array) {
  if (BINARY_TO_HEX === undefined) {
    BINARY_TO_HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  }

  // unrolled manually for 8 bytes
  return (
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    BINARY_TO_HEX[b[0]!]! +
    BINARY_TO_HEX[b[1]!] +
    BINARY_TO_HEX[b[2]!] +
    BINARY_TO_HEX[b[3]!] +
    BINARY_TO_HEX[b[4]!] +
    BINARY_TO_HEX[b[5]!] +
    BINARY_TO_HEX[b[6]!] +
    BINARY_TO_HEX[b[7]!]
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  );
}

/**
 * blazingly string decoder for spanId
 */
export function decodeSpanId(payload: string): Uint8Array {
  if (HEX_TO_BINARY === undefined) {
    HEX_TO_BINARY = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [i.toString(16).padStart(2, "0"), i]));
  }

  // unrolled manually for 16 bytes
  return new Uint8Array([
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    HEX_TO_BINARY[payload.slice(0, 2)]!,
    HEX_TO_BINARY[payload.slice(2, 4)]!,
    HEX_TO_BINARY[payload.slice(4, 6)]!,
    HEX_TO_BINARY[payload.slice(6, 8)]!,
    HEX_TO_BINARY[payload.slice(8, 10)]!,
    HEX_TO_BINARY[payload.slice(10, 12)]!,
    HEX_TO_BINARY[payload.slice(12, 14)]!,
    HEX_TO_BINARY[payload.slice(14, 16)]!,
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  ]);
}

// Lazily initialized map of byte -> hex string
let BINARY_TO_HEX: string[] | undefined;
let HEX_TO_BINARY: Record<string, number> | undefined;
