import type { Checkpoint } from "./typings.js";
import { assert } from "./util.assert.js";

/**
 * validates that `x` is a string.
 */
export const str: Checkpoint<string> = (ctx, x) => {
  assert(typeof x === "string", `${ctx} must be a string`);
  return x;
};

/**
 * validates that `x` is a string or a number.
 */
export const strOrNum: Checkpoint<string | number> = (ctx, x) => {
  assert(typeof x === "string" || typeof x === "number", `${ctx} must be string or number`);
  return x;
};

/**
 * validates that `x` is a number.
 */
export const num: Checkpoint<number> = (ctx, x) => {
  assert(typeof x === "number", `${ctx} must be a number`);
  return x;
};

/**
 * validates that `x` is a boolean.
 */
export const bool: Checkpoint<boolean> = (ctx, x) => {
  assert(typeof x === "boolean", `${ctx} must be a boolean`);
  return x;
};

/**
 * validates that `x` is either a Date or parses into a Date object if a valid
 * date string.
 */
export const date: Checkpoint<Date> = (ctx, x) => {
  if (x instanceof Date) {
    return x;
  }

  if (typeof x === "string") {
    const date = new Date(x);

    assert(!Number.isNaN(date.getTime()), `${ctx} invalid date string`);

    return date;
  }

  throw new Error(`${ctx} must be a date or date string`);
};

/**
 * pass-through validator, used mainly for the DSL to remain complete when
 * handling unknown input structures.
 */
export const unknown: Checkpoint<unknown> = (ctx, x) => x;
