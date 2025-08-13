/**
 * common assertion utility to perform type-safe validation of a condition with
 * a structured error message.
 */
export function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}
