import { makeEnumPacker } from "@direct.dev/wire";

import { str } from "./checkpoint.primitives.js";
import type { Checkpoint } from "./typings.js";
import { assert } from "./util.assert.js";
import { makeCheckpoint } from "./util.make-checker.js";

/**
 * makes a Checkpoint, which validates that `x` is a one of the provided
 * values; this can guard against a specific literal value or an enumeration of
 * allowed values.
 */
export function literal<const T extends string | number | boolean>(...values: [T, ...T[]]): Checkpoint<T> {
  const set = new Set(values);
  const wire = makeEnumPacker(values);

  return makeCheckpoint(
    (ctx, x) => {
      assert(set.has(x as T), `${ctx} must be ${JSON.stringify(values)}`);
      return x as T;
    },
    {
      encode: (ctx, x) => wire.encode(x),
      decode: (ctx, input, cursor) => wire.decode(input, cursor),
    },
  );
}

/**
 * makes a Checkpoint, which validates that `x` is a string of the designated
 * type for subsequent TypeScript inference.
 */
export function typedStr<T extends string>(): Checkpoint<T> {
  return str as Checkpoint<T>;
}
