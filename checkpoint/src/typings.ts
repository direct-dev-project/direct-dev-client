/**
 * a Checkpoint asserts that x is of the expected type, and throws a well-typed
 * error message if not.
 */
export type Checkpoint<T> = (ctx: string, x: unknown) => T;
