import { str } from "./checkpoint.primitives.js";
import type { Checkpoint } from "./typings.js";
import { assert } from "./util.assert.js";

/**
 * makes a Checkpoint, which validates that `x` is a one of the provided
 * values; this can guard against a specific literal value or an enumeration of
 * allowed values.
 */
export function literal<const T extends string | number | boolean>(...values: [T, ...T[]]): Checkpoint<T> {
  const set = new Set(values);

  return (ctx, x) => {
    assert(set.has(x as T), `${ctx} must be ${JSON.stringify(values)}`);
    return x as T;
  };
}

/**
 * makes a Checkpoint, which validates that `x` is a string of the designated
 * type for subsequent TypeScript inference.
 */
export function typedStr<T extends string>(): Checkpoint<T> {
  return (ctx, x) => str(ctx, x) as T;
}
