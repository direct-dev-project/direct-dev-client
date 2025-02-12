const totalWeight = Symbol("totalWeighting");

/**
 * inspired by the weighted library, this is a tiny implementation of a
 * randomized, weighted picker that we use to
 *
 * @see https://github.com/Schoonology/weighted/blob/master/lib/weighted.js#L28
 */
export function weightedPick<T extends { weighting: number }>(set: readonly T[] & { [totalWeight]?: number }): T {
  if (set.length === 0) {
    throw new Error("Direct.dev / weightedPick: set must contain at least 1 item");
  }

  // calculate total weighting on initial pick, cache for future calls
  if (set[totalWeight] === undefined) {
    set[totalWeight] = set.reduce((acc, it) => acc + it.weighting, 0);
  }

  // pick a random weighting, and return the first item to fulfill this weight
  let randomWeight = Math.random() * set[totalWeight];

  for (const item of set) {
    randomWeight -= item.weighting;

    if (randomWeight <= 0) {
      return item;
    }
  }

  // if we get here, totalWeight must have drifted from cached value in spite
  // of the readonly nature on the array! - reset the cache and retry picking
  set[totalWeight] = undefined;

  return weightedPick(set);
}
