/**
 * tiny abstraction to create a queue of async operations, ensuring that
 * they're executed sequentially in correct order.
 *
 * @example
 * ```ts
 * const eventQueue = makeAsyncQueue();
 *
 * eventQueue(async () => {
 *   await someExternalPromise();
 *   console.log("operation 1 completed");
 * }, (err) => {
 *   console.log("an error occurred");
 * });
 *
 * eventQueue(async () => {
 *   await someOtherExternalPromise();
 *   console.log("operation 2 completed");
 * }, (err) => {
 *   console.log("an error occurred");
 * });
 * ```
 */
export function makeAsyncQueue(): AsyncQueue {
  let eventQueue: Promise<unknown> | undefined;

  return async <T>(cb: () => Promise<T> | T, errCb?: (err: unknown) => T): Promise<T> => {
    const result = Promise.resolve(eventQueue).then(cb).catch(errCb);

    eventQueue = result.catch(() => {
      // silently suppress error, so it doesn't affect next run
    });

    return result;
  };
}

export type AsyncQueue = <T>(cb: () => Promise<T> | T, errCb?: (err: unknown) => T) => Promise<T>;
