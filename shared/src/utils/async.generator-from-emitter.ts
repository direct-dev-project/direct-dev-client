type NextResult<T, TReturn> = { done: false; value: T } | { done: true; value: TReturn };

/**
 * Low-level utility to create an AsyncGenerator from a function
 * implementation, which needs to be able to yield results through an emit
 * callback.
 *
 * This approach is useful when external I/O from the RPCDistributor needs to
 * be transformed into an AsyncGenerator, which in-turn makes it easier to
 * reason about streamed data from the RPCDistributor inside the cache layer.
 */
export async function* makeAsyncGeneratorFromEmitter<T, TReturn = void>(
  callback: (emit: (value: T) => void) => Promise<TReturn>,
): AsyncGenerator<T, TReturn> {
  // create a set of promise + resolver variables, which allows us to await the
  // next value and emit it on-demaned in the following implementation
  let nextReject: ((reason: unknown) => void) | undefined;
  let nextResolve: ((result: NextResult<T, TReturn>) => void) | undefined;
  let nextPromises = [
    new Promise<NextResult<T, TReturn>>((resolve, reject) => {
      nextResolve = resolve;
      nextReject = reject;
    }),
  ];

  // create an emission callback, which uses the above variables to allow
  // yielding values
  const emit = (value: T) => {
    if (nextResolve === undefined) {
      throw new Error(
        "makeAsyncGeneratorFromEmitter(): emit called after the original callback completed, illegal operation detected!",
      );
    }

    const prevResolve = nextResolve;

    // create a new promise for the next emitted value, so that it can be
    // awaited in-turn
    nextPromises.push(
      new Promise((resolve, reject) => {
        nextResolve = resolve;
        nextReject = reject;
      }),
    );

    // resolve the previous promise, so that the emitted value is yielded
    // externally through the AsyncGenerator
    prevResolve({ done: false, value });
  };

  // trigger the provided callback, with the ability to emit values through the
  // nextPromise/nextResolve mechanism defined above
  callback(emit)
    .then((value) => {
      // as soon as the provided callback has been fulfilled, resolve with a
      // "done" event to terminate the external AsyncGenerator as well
      nextResolve?.({
        done: true,
        value,
      });

      // prevent further resolution as the AsyncGenerator has just been halted
      nextResolve = undefined;
    })
    .catch((reason) => {
      // as soon as the provided callback has been fulfilled, resolve with a
      // "done" event to terminate the external AsyncGenerator as well
      nextReject?.(reason);
    });

  // keep iterating over the nextPromise while the callback is running, so that
  // all emitted values can be yielded to the receiver
  while (true) {
    for await (const result of nextPromises) {
      if (result.done) {
        // break the loop as soon as the external promise has been resolved
        return result.value;
      }

      yield result.value;
    }

    nextPromises = [];
  }
}
