import { isRecord } from "@direct.dev/shared";
import { pack, unpack, Wire } from "@direct.dev/wire";

import type { Checkpoint } from "./typings.js";
import { assert } from "./util.assert.js";
import { makeCheckpoint } from "./util.make-checker.js";

/**
 * makes a checkpoint, which validates the shape of a record
 */
export function shape<T extends Record<string, unknown>>(schema: {
  [K in keyof T]: Checkpoint<T[K]>;
}): Checkpoint<T> {
  const nested = Object.entries(schema) as Array<[string, Checkpoint<T[keyof T]>]>;

  return makeCheckpoint(
    (ctx, x) => {
      assert(isRecord(x), `${ctx} must be a record`);

      return nested.reduce(
        (acc, [key, checkpoint]) => {
          if (!Object.prototype.hasOwnProperty.call(x, key)) {
            if (isOptional in checkpoint && checkpoint[isOptional] === true) {
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
    },
    {
      encode: (ctx, x) => {
        let result = "";

        for (const [key, schema] of nested) {
          result += schema.encode(`${ctx}.${key}`, x[key]);
        }

        return result;
      },

      decode: (ctx, input, cursor) => {
        const result: Partial<T> = {};

        for (const [key, schema] of nested) {
          const value = schema.decode(`${ctx}.${key}`, input, cursor);

          (result as Record<string, unknown>)[key] = value[0];
          cursor = value[1];
        }

        return [result as T, cursor];
      },
    },
  );
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
  return makeCheckpoint(
    (ctx, x) => {
      assert(Array.isArray(x), `${ctx} must be an array`);

      if (options?.minLength != null) {
        assert(x.length >= options.minLength, `${ctx} must contain at least ${options.minLength} items`);
      }

      if (options?.maxLength != null) {
        assert(x.length <= options.maxLength, `${ctx} must contain at most ${options.maxLength} items`);
      }

      return x.map((val, i) => checkpoint(`${ctx}[${i}]`, val));
    },
    {
      encode: (ctx, x) => pack.arr(x, (item) => checkpoint.encode(`${ctx}[]`, item)),
      decode: (ctx, input, cursor) =>
        unpack.arr(input, cursor, (cursor) => checkpoint.decode(`${ctx}[]`, input, cursor)),
    },
  );
}

/**
 * makes a checkpoint, which validates that `x` is a tuple containing a fixed
 * number of entries, and then passes each value through the provided sub
 * checkpoint.
 */
export function tuple<const T extends unknown[]>(checkpoints: { [K in keyof T]: Checkpoint<T[K]> }): Checkpoint<T> {
  const tupleSize = checkpoints.length;

  return makeCheckpoint(
    (ctx, x) => {
      assert(Array.isArray(x), `${ctx} must be an array`);
      assert(x.length === tupleSize, `${ctx} doesn't match required tuple length`);

      const res = new Array(tupleSize) as T;

      for (let i = 0; i < tupleSize; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        res[i] = checkpoints[i]!(`${ctx}[${i}]`, x[i]);
      }

      return res;
    },
    {
      encode: (ctx, x) => {
        let res = "";

        for (let i = 0; i < tupleSize; i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          res += checkpoints[i]!.encode(`${ctx}[${i}]`, x[i]);
        }

        return res;
      },
      decode: (ctx, input, cursor) => {
        const res = new Array(tupleSize);

        for (let i = 0; i < tupleSize; i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const subRes = checkpoints[i]!.decode(`${ctx}[${i}]`, input, cursor);

          res[i] = subRes[0];
          cursor = subRes[1];
        }

        return [res, cursor];
      },
    },
  );
}

/**
 * makes a Checkpoint, which validates that `x` is one of a union of other
 * Checkpoints.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function union<const T extends ReadonlyArray<Checkpoint<any>>>(
  ...checkpoints: T
): Checkpoint<ReturnType<T[number]>> {
  return makeCheckpoint(
    (ctx, x) => {
      const errors: string[] = [];

      for (const cp of checkpoints) {
        try {
          return cp(ctx, x);
        } catch (err) {
          errors.push((err as Error).message);
        }
      }

      throw new Error(
        `${ctx} did not match any union type:\n  - ${errors.map((it) => (it.startsWith("Direct.dev: ") ? it.substring(12) : it)).join("\n  - ")}`,
      );
    },
    {
      encode: () => {
        throw new Error("union.encode(): wire doesn't support unions");
      },
      decode: () => {
        throw new Error("union.decode(): wire doesn't support unions");
      },
    },
  );
}

/**
 * Makes a checkpoint, which passes null through and otherwise runs the
 * provided checkpoint on real values.
 */
export function nullish<T>(checkpoint: Checkpoint<T>): Checkpoint<T | null> {
  const wire = new Wire<T | null, [ctx: string]>(
    {
      null: {
        id: 1,
        encode: () => "",
        decode: (input, cursor) => [null, cursor],
      },

      defined: {
        id: 2,
        encode: (input, extraArgs) => checkpoint.encode(extraArgs[0], input),
        decode: (input, cursor) => checkpoint.decode("", input, cursor),
      },
    },
    (input) => {
      if (input === null) {
        return "null";
      }

      return "defined";
    },
  );

  return Object.assign(
    makeCheckpoint(
      (ctx: string, x: unknown) => {
        if (x === null) {
          return x;
        }

        return checkpoint(ctx, x);
      },
      {
        encode: (ctx, x) => wire.encode(x, ctx),
        decode: (ctx, input, cursor) => wire.decode(input, cursor),
      },
    ),
  );
}

/**
 * Makes a checkpoint, which passes undefined through and otherwise runs the
 * provided checkpoint on real values.
 */
export function optional<T>(checkpoint: Checkpoint<T>): Checkpoint<T | undefined> {
  const wire = new Wire<T | undefined, [ctx: string]>(
    {
      undefined: {
        id: 1,
        encode: () => "",
        decode: (input, cursor) => [undefined, cursor],
      },

      defined: {
        id: 2,
        encode: (input, extraArgs) => checkpoint.encode(extraArgs[0], input),
        decode: (input, cursor) => checkpoint.decode("", input, cursor),
      },
    },
    (input) => {
      if (input === void 0) {
        return "undefined";
      }

      return "defined";
    },
  );

  return Object.assign(
    makeCheckpoint(
      (ctx: string, x: unknown) => {
        if (x === undefined) {
          return x;
        }

        return checkpoint(ctx, x);
      },
      {
        encode: (ctx, x) => wire.encode(x, ctx),
        decode: (ctx, input, cursor) => wire.decode(input, cursor),
      },
    ),
    { [isOptional]: true },
  );
}

const isOptional = Symbol("isOptional");
