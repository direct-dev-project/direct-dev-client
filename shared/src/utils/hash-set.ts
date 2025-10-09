import { hash } from "./hashing.hash.js";

export type HashSetChecksum = HashStr & { readonly __subbrand: unique symbol };

export type HashSetDelta<T extends string> = {
  added: T[];
  removed: T[];

  /**
   * Checksum of the resulting set after applying the delta.
   */
  checksum: HashSetChecksum;
};

/**
 * serializeable expression of the current version of a HashSet, so it can be
 * transmitted and rehydrated easily.
 */
export type HashSetJSON<T extends string> = {
  items: T[];
  checksum: HashSetChecksum;
};

/**
 * basic abstraction around a Set of sha256-hashes, allowing safe distribution
 * using deltas and versioned access to add a grace period while updates
 * propagate through layers of the infrastructure.
 */
export class HashSet<T extends string> {
  /**
   * array of hashes, allowing index --> hash lookup and iteration.
   */
  #asArray: T[];

  /**
   * mapping from hash --> index for constant time complexity lookups
   */
  #asMap: Map<T, number>;

  /**
   * checksum of the current contents of the hash set.
   */
  #checksum = (hashOfEmptyString ??= hash("")) as HashSetChecksum;

  constructor(fromJSON?: HashSetJSON<T>) {
    if (fromJSON) {
      this.#asArray = fromJSON.items.sort();
      this.#asMap = new Map(fromJSON.items.map((hash, index) => [hash, index] as const));
    } else {
      this.#asArray = [];
      this.#asMap = new Map();
    }
  }

  /**
   * get the hash at the specified index, optionally looking within a specific
   * version.
   */
  getHashByIndex(index: number): T | undefined {
    return this.#asArray[index];
  }

  /**
   * get the index of the specified hash, optionally looking within a specific
   * version.
   */
  getIndexByHash(hash: T): number | undefined {
    return this.#asMap.get(hash);
  }

  /**
   * check if the given hash exists within the set
   */
  has(hash: T): boolean {
    return this.#asMap.has(hash);
  }

  /**
   * return all hashes contained within the set.
   */
  toArray(): T[] {
    return this.#asArray;
  }

  /**
   * return the checksum of the current version.
   */
  getChecksum(): HashSetChecksum {
    return this.#checksum;
  }

  /**
   * apply a full update to the set, returning delta for safe and minimal
   * distribution to other layers.
   */
  async applyUpdate(nextValue: Iterable<T>): Promise<HashSetDelta<T>> {
    const prevMap = this.#asMap;

    // apply the new set as the latest version
    this.#asArray = Array.from(nextValue).sort();
    this.#asMap = new Map(this.#asArray.map((hash, index) => [hash, index] as const));
    this.#checksum = (await hash(this.#asArray.join(","))) as HashSetChecksum;

    // calculate delta between previous and new version
    const added: T[] = [];
    const removed: T[] = [];

    for (const item of nextValue) {
      if (!prevMap.has(item)) {
        added.push(item);
      }
    }

    for (const item of prevMap.keys()) {
      if (!this.#asMap.has(item)) {
        removed.push(item);
      }
    }

    return {
      added,
      removed,
      checksum: this.#checksum,
    };
  }

  /**
   * applies a delta to the current hash set, verifying the integrity of the
   * new version and caching it in-memory for future use.
   */
  async applyDelta(delta: HashSetDelta<T>): Promise<boolean> {
    // apply the delta
    const nextSet = new Set(this.#asArray);

    for (const removed of delta.removed) {
      nextSet.delete(removed);
    }

    for (const added of delta.added) {
      nextSet.add(added);
    }

    // verify checksum, and bail out if invalid
    const nextArr = Array.from(nextSet).sort();
    const nextMap = new Map(nextArr.map((hash, index) => [hash, index] as const));
    const checksum = (await hash(nextArr.join(","))) as HashSetChecksum;

    if (checksum !== delta.checksum) {
      return false;
    }

    // ... otherwise apply the new hash set
    this.#asArray = nextArr;
    this.#asMap = nextMap;
    this.#checksum = checksum;

    return true;
  }

  /**
   * utility to dump current state to a JSON serializable state, which can by
   * instantly hydrated
   */
  toJSON(): HashSetJSON<T> {
    return {
      items: this.#asArray,
      checksum: this.#checksum,
    };
  }
}

let hashOfEmptyString: HashStr | undefined;
