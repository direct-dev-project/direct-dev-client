export type Deferred<T> = Promise<T> & {
  __isFulfilled(): boolean;
  __resolve(value: T): void;
  __reject(reason: unknown): void;
};

/**
 * tiny utility to make a "deferred" object, which is essentially a promise
 * that allows calling resolve/reject externally.
 *
 * this pattern is useful when we are handling inflight uniqueness, where we
 * need to create promise objects that are resolved later on through iterator
 * result values.
 */
export function makeDeferred<T>(): Deferred<T> {
  let __resolve: (value: T) => void;
  let __reject: (reason: unknown) => void;
  let __isFulfilled = false;

  const promise = new Promise<T>((resolve, reject) => {
    __resolve = (value) => {
      resolve(value);

      __isFulfilled = true;
      __resolve = () => {
        throw new Error("makeDeferred(): cannot resolve a promise that is already resolved");
      };
      __reject = () => {
        throw new Error("makeDeferred(): cannot reject a promise that is already resolved");
      };
    };
    __reject = (reason: unknown) => {
      reject(reason);

      __isFulfilled = true;
      __resolve = () => {
        throw new Error("makeDeferred(): cannot resolve a promise that is already rejected");
      };
      __reject = () => {
        throw new Error("makeDeferred(): cannot reject a promise that is already rejected");
      };
    };
  });

  const deferred = Object.assign(promise, {
    __isFulfilled: () => __isFulfilled,
    __resolve: (value: T) => __resolve(value),
    __reject: (reason: unknown) => __reject(reason),
  });

  return deferred;
}
