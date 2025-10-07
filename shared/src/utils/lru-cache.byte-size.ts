/**
 * LRU cache implementation, using a Map behind the scenes to track lease
 * recent usage in constant time complexity.
 *
 * Eviction happens when total estimated byte-size of the cache exceeds the
 * allowed limits, rather than using a fixed amount of allowed entries. This
 * allows retaining as much data as possible in the cache, while guaranteeing
 * strong bounds on upper cache size limits.
 */
export class LRUByteSizeCache<K, V> {
  /**
   * contains the actual cache values, including their estimated byte sizes.
   */
  #cache = new Map<
    K,
    {
      value: V;
      estimatedByteSize: number;
    }
  >();

  /**
   * specifies the maximum allowed size of this cache, as configured on
   * instantiation.
   */
  #maxByteSize: number;

  /**
   * specifies the current estimated size of the cache
   */
  #estimatedSizeInBytes = 0;

  /**
   * reference to the onInsert callback (if given), to be triggered whenever
   * new entries are inserted into the cache.
   */
  #onInsert: (key: K, value: V) => void;

  /**
   * reference to the onEvict callback (if given), to be triggered whenever
   * entries are automatically evicted from cache.
   */
  #onEvict: (key: K) => void;

  constructor(
    maxByteSize: number,
    eventHandlers?: {
      onInsert?: (key: K, value: V) => void;
      onEvict?: (key: K) => void;
    },
  ) {
    this.#maxByteSize = maxByteSize;

    this.#onInsert =
      eventHandlers?.onInsert ??
      (() => {
        /* noop */
      });
    this.#onEvict =
      eventHandlers?.onEvict ??
      (() => {
        /* noop */
      });
  }

  /**
   * returns the currently estimated size of the cache.
   */
  get estimatedSizeInBytes(): number {
    return this.#estimatedSizeInBytes;
  }

  /**
   * returns the number of entries currently held within the cache.
   */
  get size(): number {
    return this.#cache.size;
  }

  /**
   * gets an entry from the cache, marking it as recently used
   */
  get(key: K): V | undefined {
    const value = this.#cache.get(key);

    if (value === undefined) {
      return undefined;
    }

    // re-insert in map to mark as recently used
    this.#cache.delete(key);
    this.#cache.set(key, value);

    return value.value;
  }

  /**
   * inserts an entry into the cache, evicting the least recently used one if
   * maximum size has been reached
   */
  set(key: K, value: V, estimatedByteSize: number): void {
    if (this.#cache.has(key)) {
      // if the entry already exists within the cache, then delete it to allow
      // re-insertion so it's tracked as recently used
      this.delete(key);
    } else {
      this.#onInsert(key, value);
    }

    this.#cache.set(key, { value, estimatedByteSize });
    this.#estimatedSizeInBytes += estimatedByteSize;

    // auto-evict oldest entries until cache size is within the configured
    // threshold
    while (this.#estimatedSizeInBytes > this.#maxByteSize && this.#cache.size > 1) {
      // grab the oldest inserted entry within the cache (relying on insertion
      // order in the Map we're using behind the scenes)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [oldestKey, oldestValue] = this.#cache.entries().next().value!;

      this.#cache.delete(oldestKey);
      this.#estimatedSizeInBytes -= oldestValue.estimatedByteSize;

      this.#onEvict(oldestKey);
    }
  }

  /**
   * check if the specified key exists within the cache map.
   */
  has(key: K) {
    return this.#cache.has(key);
  }

  /**
   * delete the specified key from the cache.
   */
  delete(key: K) {
    const value = this.#cache.get(key);

    if (value !== undefined) {
      this.#cache.delete(key);
      this.#estimatedSizeInBytes -= value.estimatedByteSize;

      this.#onEvict(key);
    }
  }

  /**
   * clear all entries from within the cache
   */
  clear() {
    this.#cache.keys().forEach((key) => {
      this.#onEvict(key);
    });

    this.#cache.clear();
    this.#estimatedSizeInBytes = 0;
  }

  /**
   * return the list of keys currently inserted into the cache
   */
  keys() {
    return this.#cache.keys();
  }

  /**
   * return the list of values currently inserted into the cache
   */
  *values() {
    for (const value of this.#cache.values()) {
      yield value.value;
    }
  }

  /**
   * return the list of entries currently inserted into the cache
   */
  *entries() {
    for (const [key, value] of this.#cache.entries()) {
      yield [key, value.value] as const;
    }
  }
}
