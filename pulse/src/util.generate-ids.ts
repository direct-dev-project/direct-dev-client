/**
 * Generate a random 16-byte trace ID compatible with OTLP
 */
export function generateTraceId() {
  const b = crypto.getRandomValues(new Uint8Array(16));

  if (HEX === undefined) {
    HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  }

  // unrolled manually for 16 bytes
  return (
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    HEX[b[0]!]! +
    HEX[b[1]!] +
    HEX[b[2]!] +
    HEX[b[3]!] +
    HEX[b[4]!] +
    HEX[b[5]!] +
    HEX[b[6]!] +
    HEX[b[7]!] +
    HEX[b[8]!] +
    HEX[b[9]!] +
    HEX[b[10]!] +
    HEX[b[11]!] +
    HEX[b[12]!] +
    HEX[b[13]!] +
    HEX[b[14]!] +
    HEX[b[15]!]
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  );
}

/**
 * Generate a random 8-byte span ID compatible with OTLP
 */
export function generateSpanId() {
  const b = crypto.getRandomValues(new Uint8Array(8));

  if (HEX === undefined) {
    HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  }

  // unrolled manually for 8 bytes
  return (
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    HEX[b[0]!]! + HEX[b[1]!] + HEX[b[2]!] + HEX[b[3]!] + HEX[b[4]!] + HEX[b[5]!] + HEX[b[6]!] + HEX[b[7]!]
    /* eslint-enable @typescript-eslint/no-non-null-assertion */
  );
}

// Lazily initialized map of byte -> hex string
let HEX: string[] | undefined;
