import { unpack } from "./core.pack.js";

/**
 * Apply a patch string to a previous version to reconstruct the new string.
 *
 * As multiple patches may be batched into a single payload when transmitted,
 * this function requires an initial cursor from which to start unpacking
 * operations and applying the patch.
 *
 * The end cursor is supplied at the end of the string, to allow continued
 * processing of subsequent patches.
 */
export function applyPatch(oldStr: string, patchStr: string, patchCursor = 0): string {
  //
  // STEP: read header from patch
  //

  const prefixLength = unpack.int(patchStr, patchCursor);
  const suffixLength = unpack.int(patchStr, prefixLength[1]);

  //
  // STEP: read and apply all operations of the patch
  //

  // extract patch operations
  const ops = unpack.arr(patchStr, suffixLength[1], (cursor) => {
    const sx = unpack.int(patchStr, cursor);
    const dx = unpack.int(patchStr, sx[1]);
    const insert = unpack.str(patchStr, dx[1]);

    return [
      {
        sx: sx[0],
        ex: sx[0] + dx[0],
        insert: insert[0],
      },
      insert[1],
    ];
  });

  // apply operations
  let result = oldStr.slice(0, prefixLength[0]);
  let oldCursor = prefixLength[0];

  for (const op of ops[0]) {
    const adjustedSx = prefixLength[0] + op.sx;
    const adjustedEx = prefixLength[0] + op.ex;

    // Copy unchanged region from oldStr
    if (oldCursor < adjustedSx) {
      result += oldStr.slice(oldCursor, adjustedSx);
    }

    // Apply insertions from patch
    result += op.insert;

    // Skip deleted region
    oldCursor = adjustedEx;
  }

  result += oldStr.slice(oldCursor);

  return result;
}
