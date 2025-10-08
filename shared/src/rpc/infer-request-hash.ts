/**
 * tiny utility to extract request hash from a full cache key, internally
 * relying on the wire to unpack the leading sha256 request hash from the key.
 */
export function inferRequestHashFromCacheKey(key: DirectCacheKey): DirectRequestHash {
  return key.slice(0, 19) as DirectRequestHash;
}
