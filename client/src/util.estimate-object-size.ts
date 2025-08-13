/**
 * provide a rough estimate of the response size, to be used with the
 * LRUByteSizeCache
 */
export function estimateResponseSize(res: DirectRPCResultResponse) {
  const seen = new WeakSet();
  const stack: unknown[] = [res];
  let bytes = 0;

  while (stack.length) {
    const value = stack.pop();

    if (value === null || value === undefined) {
      // rough estimate of empty values
      bytes += 4;
      continue;
    }

    switch (typeof value) {
      case "boolean":
        bytes += 4;
        break;

      case "number":
        bytes += 8;
        break;

      case "string":
        // UTF-16 taking up-to 2 bytes per character
        return value.length * 2;

      case "object": {
        if (seen.has(value)) {
          // ignore circular references
          continue;
        }

        seen.add(value);

        if (Array.isArray(value)) {
          // estimated array overhead
          bytes += 16;

          // estimate size of all items contained within the array
          for (const item of value) {
            stack.push(item);
          }
        } else {
          // estimated object overhead
          bytes += 32;

          // estimate size of all properties on the object
          for (const [key, nestedValue] of Object.entries(value)) {
            bytes += key.length;
            stack.push(nestedValue);
          }
        }
      }
    }
  }

  return bytes;
}
