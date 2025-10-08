/**
 * Produces a fast, deterministic 96-bit non-cryptographic hash string
 * from a given UTF-16 input. Uses FNV-1a 64-bit + 32-bit mixing and
 * encodes output in a printable 7-bit-chunk format inspired by
 * @direct.dev/wire with length postfix.
 *
 * ⚠️ Not cryptographically secure.
 */
export function hash(input: string): HashStr {
  const len = input.length;

  return (fnv1a64(input) +
    fnv1a32(input) +
    String.fromCharCode((len >>> 0) & 0x7f, (len >>> 7) & 0x7f, (len >>> 14) & 0x7f, (len >>> 21) & 0x7f)) as HashStr;
}

/**
 * Implementation of FNV-1a 64 bit hashing, used as first segment for full hash
 * output.
 */
export function fnv1a64(input: string): string {
  let lo = 0x84222325;
  let hi = 0xcbf29ce4;

  for (let i = 0, j = input.length; i < j; i++) {
    const c = input.charCodeAt(i);
    lo ^= c;

    const mul = Math.imul(lo, 0x1b3);
    const carry = (lo * 0x1b3 - (mul >>> 0)) / 0x100000000;

    lo = mul >>> 0;
    hi = (Math.imul(hi, 0x1b3) + carry) >>> 0;
  }

  // fixed-length encoding of 64-bits of entropy as 10 bytes
  return String.fromCharCode(
    (lo >>> 0) & 0x7f,
    (lo >>> 7) & 0x7f,
    (lo >>> 14) & 0x7f,
    (lo >>> 21) & 0x7f,
    (lo >>> 28) & 0x7f,
    (hi >>> 0) & 0x7f,
    (hi >>> 7) & 0x7f,
    (hi >>> 14) & 0x7f,
    (hi >>> 21) & 0x7f,
    (hi >>> 28) & 0x7f,
  );
}

/**
 * Implementation of FNV-1a 32 bit hashing, used as second segment for full hash
 * output.
 */
export function fnv1a32(input: string): string {
  let h = 0x811c9dc5;

  for (let i = 0, j = input.length; i < j; i++) {
    h ^= input.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  // fixed-length encoding of 32-bits of entropy as 10 bytes
  return String.fromCharCode(
    (h >>> 0) & 0x7f,
    (h >>> 7) & 0x7f,
    (h >>> 14) & 0x7f,
    (h >>> 21) & 0x7f,
    (h >>> 28) & 0x7f,
  );
}
