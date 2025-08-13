import type { Checkpoint } from "./typings.js";

export * from "./checkpoint.composites.js";
export * from "./checkpoint.extras.js";
export * from "./checkpoint.primitives.js";

/**
 * make a checkpoint with a public context for clean outputs.
 */
export function checkpoint<T>(ctx: string, fn: Checkpoint<T>): (x: unknown) => T {
  return (x) => fn(ctx, x);
}
