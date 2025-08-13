/**
 * compares two blockHeights to determine which of them is greatest, following
 * simple compareFn conventions
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#comparefn
 */
export function compareBlockHeights(a: RPCBlockHeight, b: RPCBlockHeight): -1 | 0 | 1 | undefined {
  const aRaw = getRawBlockHeight(a);
  if (aRaw === undefined) {
    return undefined;
  }
  const bRaw = getRawBlockHeight(b);
  if (bRaw === undefined) {
    return undefined;
  }

  const lengthDiff = a.length - b.length;

  if (lengthDiff !== 0) {
    return lengthDiff > 0 ? 1 : -1;
  }

  for (let i = 0; i < a.length; i++) {
    const aChar = a.charCodeAt(i);
    const bChar = b.charCodeAt(i);

    if (aChar > bChar) {
      // if we encounter a scenario where aChar is greater than bChar, that
      // means that a has a leading value greater than b and therefor we can
      // assume it's absolute value is greater than b
      return 1;
    } else if (bChar > aChar) {
      // inversely the same can be said, if bChar is greater than aChar, then b
      // will be greater than a
      return -1;
    }
  }

  // if we get here, the two provided values are identical - return 0 to
  // indicate this result
  return 0;
}

function getRawBlockHeight(input: RPCBlockHeight): string | undefined {
  if (input.slice(0, 2) !== "0x") {
    // block height must start with 0x as per the specification
    return undefined;
  }

  if (input === "0x0") {
    return "0";
  }

  if (input.charAt(2) === "0") {
    // block height param does not support leading zeroes, reject the
    // value
    return undefined;
  }

  return input.slice(2);
}

/**
 * tiny wrapper around compareBlockHeight which detects if a current block
 * height is ahead of the base block height (used frequently throughout the
 * codevase to review how to handle )
 */
export function isBlockHeightAhead(
  currentBlockHeight: RPCBlockHeight,
  baseBlockHeight: RPCBlockHeight,
): boolean | undefined {
  const comparisson = compareBlockHeights(currentBlockHeight, baseBlockHeight);

  if (comparisson != null) {
    return comparisson === 1;
  } else {
    return undefined;
  }
}
