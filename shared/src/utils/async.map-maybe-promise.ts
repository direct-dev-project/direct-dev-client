/**
 * tiny utility to map potential promises, without forcing async/await syntax
 * on values that are available synchroneously.
 */
export function mapMaybePromise<TIn, TOut>(
  maybePromise: Promise<TIn> | TIn,
  cb: (value: TIn) => MaybePromise<TOut>,
): MaybePromise<TOut> {
  if (typeof maybePromise == "object" && maybePromise != null && "then" in maybePromise) {
    return maybePromise.then(cb);
  }

  return cb(maybePromise);
}
