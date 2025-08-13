import { isRecord } from "@direct.dev/shared";

import type { Checkpoint } from "./typings.js";
import { assert } from "./util.assert.js";

/**
 * makes a checkpoint, which validates the shape of a record
 */
export function shape<T extends Record<string, unknown>>(schema: {
  [K in keyof T]: Checkpoint<T[K]>;
}): Checkpoint<T> {
  const nested = Object.entries(schema);

  return (ctx, x) => {
    assert(isRecord(x), `${ctx} must be a record`);

    return nested.reduce(
      (acc, [key, checkpoint]) => {
        if (!Object.prototype.hasOwnProperty.call(x, key)) {
          if (checkpoint[isOptional] === true) {
            // if this is an optional value, and it doesn't exist on the input
            // structure - then discard it on output structure as well
            return acc;
          }

          throw new Error(`${ctx}.${key} is required`);
        }

        acc[key] = checkpoint(`${ctx}.${key}`, x[key]);

        return acc;
      },
      {} as Record<string, unknown>,
    ) as T;
  };
}

/**
 * makes a checkpoint, which validates that `x` is an array, and then passes
 * each value through the provided sub checkpoint.
 */
export function arr<T>(
  checkpoint: Checkpoint<T>,
  options?: {
    minLength?: number;
    maxLength?: number;
  },
): Checkpoint<T[]> {
  return (ctx, x) => {
    assert(Array.isArray(x), `${ctx} must be an array`);

    if (options?.minLength != null) {
      assert(x.length >= options.minLength, `${ctx} must contain at least ${options.minLength} items`);
    }

    if (options?.maxLength != null) {
      assert(x.length <= options.maxLength, `${ctx} must contain at most ${options.maxLength} items`);
    }

    return x.map((val, i) => checkpoint(`${ctx}[${i}]`, val));
  };
}

/**
 * makes a Checkpoint, which validates that `x` is one of a union of other
 * Checkpoints.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function union<const T extends ReadonlyArray<Checkpoint<any>>>(
  ...checkpoints: T
): Checkpoint<ReturnType<T[number]>> {
  return (ctx, x) => {
    const errors: string[] = [];

    for (const cp of checkpoints) {
      try {
        return cp(ctx, x);
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    throw new Error(`${ctx} did not match any union type:\n  - ${errors.join("\n  - ")}`);
  };
}

/**
 * makes a checkpoint, which passes null or undefined through and otherwise
 * runs the provided checkpoint on real values.
 */
export function optional<T>(checkpoint: Checkpoint<T>): Checkpoint<T | null | undefined> {
  return Object.assign(
    (ctx: string, x: unknown) => {
      if (x == null) {
        return x;
      }

      return checkpoint(ctx, x);
    },
    { [isOptional]: true },
  );
}

const isOptional = Symbol("isOptional");
