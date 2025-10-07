import * as composites from "./checkpoint.composites.js";
import * as extras from "./checkpoint.extras.js";
import * as primitives from "./checkpoint.primitives.js";
import type { Checkpoint } from "./typings.js";

export type { Checkpoint };

export const check = {
  ...composites,
  ...extras,
  ...primitives,
};

/**
 * make a checkpoint with a public context for clean outputs.
 */
export function checkpoint<T>(
  ctx: string,
  cp: Checkpoint<T>,
): ((x: unknown) => T) & {
  encode: (x: unknown) => string;
  decode: (input: string, cursor?: number) => [T, number];
} {
  return Object.assign((x: unknown) => cp(ctx, x), {
    encode: (x: unknown) => cp.encode(ctx, x),
    decode: (input: string, cursor = 0) => cp.decode(ctx, input, cursor),
  });
}
