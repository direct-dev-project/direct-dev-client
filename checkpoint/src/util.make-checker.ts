import type { Checkpoint } from "./typings.js";

/**
 * tiny utility to create type safe checkpoints, including Wire-based
 * encoder/decoder pairs.
 */
export function makeCheckpoint<T>(
  check: (ctx: string, x: unknown) => T,
  wire: {
    encode: (ctx: string, x: T) => string;
    decode: (ctx: string, input: string, cursor: number) => [unknown, number];
  },
): Checkpoint<T> {
  return Object.assign(check, {
    encode: (ctx: string, x: unknown) => wire.encode(ctx, check(ctx, x)),
    decode: (ctx: string, input: string, cursor: number): [T, number] => {
      const res = wire.decode(ctx, input, cursor);
      return [check(ctx, res[0]), res[1]];
    },
  });
}
