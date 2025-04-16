/**
 * quickly generate a compact and unique session ID with 48 bits of entropy,
 * encoded for maximum density when packed with UTF-8 without using invisible
 * characters
 */
export function generateSessionId(): string {
  // generate entropy and convert to a single BigInt
  const bytes = crypto.getRandomValues(new Uint8Array(6));

  let value = BigInt(0);
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }

  // encode value for maximum density
  let result = "";
  do {
    const digit = value % 96n;
    result += String.fromCharCode(Number(digit) + 33);
    value = (value - digit) / 96n;
  } while (value > 0);

  return result;
}
