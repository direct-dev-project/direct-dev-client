/**
 * a Checkpoint asserts that x is of the expected type, and throws a well-typed
 * error message if not.
 */
export type Checkpoint<T> = ((ctx: string, x: unknown) => T) & {
  encode: (ctx: string, x: unknown) => string;
  decode: (ctx: string, input: string, cursor: number) => [T, number];
};
