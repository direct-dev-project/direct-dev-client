let hasWarnedAboutInsecureContext = false;

const encoder = new TextEncoder();

/**
 * Web APIs implementation to generate a SHA-256 hash in hexadecimal output
 * from the given input string
 */
export async function sha256(input: string): Promise<string> {
  if (crypto.subtle === undefined) {
    if (!hasWarnedAboutInsecureContext) {
      // eslint-disable-next-line no-console
      console.warn(
        "Direct.dev: You're running in an insecure context, which prevents using crypto.subtle for sha256 hashing. Your application should work just fine, but predictive prefetching will fail to deliver content ahead of time.",
      );
    }

    hasWarnedAboutInsecureContext = true;

    // cannot hash in insecure contexts, simply use input in it's raw form...
    return input;
  }

  // Step 1: Compute SHA-256 using Web Crypto API
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  const hashBytes = new Uint8Array(hashBuffer); // 32 bytes (256 bits)

  // Step 2: Convert hash to base-128
  let base128 = "";
  let buffer = 0;
  let bitsInBuffer = 0;

  for (const bytes of hashBytes) {
    buffer = (buffer << 8) | bytes;
    bitsInBuffer += 8;

    // Extract 7-bit chunks while we have at least 7 bits
    do {
      bitsInBuffer -= 7;
      base128 += String.fromCharCode((buffer >> bitsInBuffer) & 0x7f); // 0x7F = 127
    } while (bitsInBuffer >= 7);
  }

  // Handle remaining bits (pad with zeros on the right)
  if (bitsInBuffer > 0) {
    base128 += String.fromCharCode((buffer << (7 - bitsInBuffer)) & 0x7f);
  }

  return base128;
}
