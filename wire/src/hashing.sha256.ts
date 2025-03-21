/**
 * Web APIs implementation to generate a SHA-256 hash in hexadecimal output
 * from the given input string
 */
export async function sha256(input: string): Promise<string> {
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
}
