import type { DirectRPCRequest, RPCRequestHash } from "../typings.rpc.js";

/**
 * Fast and consistent hashing of RPC requests, so that we can reliably track
 * popularity of requests and read/write cache entries based on these hashes.
 */
export function hashRPCRequest({ method, params }: DirectRPCRequest): Promise<RPCRequestHash> {
  return sha256(`${method}:${sortInput(params)}`) as Promise<RPCRequestHash>;
}

function sortInput(input: unknown): string {
  if (!input) {
    return String(input);
  }

  switch (typeof input) {
    // primitive types are easily serializable, allow through "as is"
    case "bigint":
    case "boolean":
    case "undefined":
    case "number":
      return String(input);

    case "string":
      return input;

    // functions and symbols are not allowed - we don't need to handle these
    // in any special way, simply return an empty string
    case "function":
    case "symbol":
      return "";

    // objects are special; ensure that records are returned in a truly
    // serializable way
    case "object":
      if (Array.isArray(input)) {
        return input.map((it) => sortInput(it)).join(",");
      }

      return Array.from(Object.entries(input))
        .sort(([a], [b]) => {
          if (a === b) {
            return 0;
          }

          return a > b ? 1 : -1;
        })
        .map(([key, value]) => `${key}:${value}`)
        .join("|");
  }

  return "";
}

/**
 * Web APIs implementation to generate a SHA-256 hash in hexadecimal output
 * from the given input string
 */
const sha256 = async (input: string) => {
  // Encode the input string into a Uint8Array using TextEncoder.
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Use the Web Crypto API to compute the SHA-256 hash of the input data.
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert the hash from an ArrayBuffer to a hexadecimal string.
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");

  // Return hash
  return hashHex;
};
