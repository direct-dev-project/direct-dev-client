/**
 * Tiny utility to help stringify unknown attributes with as much meaningful
 * data as possible.
 */
export function stringifyAttribute(attr: unknown): string {
  if (attr && attr instanceof Error && attr.stack) {
    // include stack trace in errors
    return String(attr) + "\n" + attr.stack;
  }

  if (attr != null && typeof attr == "object") {
    return JSON.stringify(attr);
  }

  return String(attr);
}
