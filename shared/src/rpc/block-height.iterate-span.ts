/**
 * basic utility to create a generator which allows looping over the difference
 * between two block heights.
 */
export function* iterateBlockSpan(from: RPCBlockHeight, to: RPCBlockHeight): Generator<RPCBlockHeight> {
  let curr = BigInt(from);
  const end = BigInt(to);

  while (++curr <= end) {
    yield `0x${curr.toString(16)}`;
  }
}
