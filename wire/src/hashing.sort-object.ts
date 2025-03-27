/**
 * tiny generic object sorter that creates a consistent output regardless of
 * the ordering of properties in input.
 */
export function sortObject(obj: unknown): string {
  if (!obj) {
    return String(obj);
  }

  switch (typeof obj) {
    // primitive types are easily serializable, allow through "as is"
    case "bigint":
    case "boolean":
    case "undefined":
    case "number":
      return String(obj);

    case "string":
      return obj;

    // functions and symbols are not allowed - we don't need to handle these
    // in any special way, simply return an empty string
    case "function":
    case "symbol":
      return "";

    // objects are special; ensure that records are returned in a truly
    // serializable way
    case "object":
      if (Array.isArray(obj)) {
        return obj.map((it) => sortObject(it)).join(",");
      }

      return Array.from(Object.entries(obj))
        .sort(([a], [b]) => {
          if (a === b) {
            return 0;
          }

          return a > b ? 1 : -1;
        })
        .map(([key, value]) => `${key}:${sortObject(value)}`)
        .join("|");
  }

  return "";
}
