/**
 * quickly generate a compact and unique ID with the specified number of bytes
 * worth of entropy.
 */
export function generateRandomId(bytesOfEntropy = 6): string {
  // generate entropy and convert to a single BigInt
  const bytes = crypto.getRandomValues(new Uint8Array(bytesOfEntropy));

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
