import { pack, unpack } from "@direct.dev/wire";

import { assert } from "./util.assert.js";
import { makeCheckpoint } from "./util.make-checker.js";

/**
 * validates that `x` is a string.
 */
export const str = makeCheckpoint<string>(
  (ctx, x) => {
    assert(typeof x === "string", `${ctx} must be a string`);
    return x;
  },
  {
    encode: (_, x) => pack.str(x),
    decode: (_, input, cursor) => unpack.str(input, cursor),
  },
);

/**
 * validates that `x` is a string or a number.
 */
export const strOrNum = makeCheckpoint<string | number>(
  (ctx, x) => {
    assert(typeof x === "string" || typeof x === "number", `${ctx} must be string or number`);
    return x;
  },
  {
    encode: (_, x) => pack.primitive(x),
    decode: (_, input, cursor) => unpack.primitive(input, cursor),
  },
);

/**
 * validates that `x` is a number.
 */
export const num = makeCheckpoint<number>(
  (ctx, x) => {
    assert(typeof x === "number", `${ctx} must be a number`);
    return x;
  },
  {
    encode: (_, x) => pack.num(x),
    decode: (_, input, cursor) => unpack.num(input, cursor),
  },
);

/**
 * validates that `x` is a uint32.
 */
export const uint32 = makeCheckpoint<number>(
  (ctx, x) => {
    assert(typeof x === "number" && x >>> 0 === x, `${ctx} must be a uint32`);
    return x;
  },
  {
    encode: (_, x) => pack.int(x),
    decode: (_, input, cursor) => unpack.int(input, cursor),
  },
);

/**
 * validates that `x` is a boolean.
 */
export const bool = makeCheckpoint<boolean>(
  (ctx, x) => {
    assert(typeof x === "boolean", `${ctx} must be a boolean`);
    return x;
  },
  {
    encode: (_, x) => pack.bool(x),
    decode: (_, input, cursor) => unpack.bool(input, cursor),
  },
);

/**
 * validates that `x` is either a Date or parses into a Date object if a valid
 * date string.
 */
export const date = makeCheckpoint<Date>(
  (ctx, x) => {
    if (x instanceof Date) {
      return x;
    }

    if (typeof x === "string") {
      const date = new Date(x);

      assert(!Number.isNaN(date.getTime()), `${ctx} invalid date string`);

      return date;
    }

    throw new Error(`${ctx} must be a date or date string`);
  },
  {
    encode: (_, x) => pack.date(x),
    decode: (_, input, cursor) => unpack.date(input, cursor),
  },
);

/**
 * pass-through validator, used mainly for the DSL to remain complete when
 * handling unknown input structures.
 */
export const unknown = makeCheckpoint<unknown>((ctx, x) => x, {
  encode: (_, x) => pack.json(x),
  decode: (_, input, cursor) => unpack.json(input, cursor),
});
