/**
 * very basic LRU cache implementation, using a Map behind the scenes to track
 * least recent usage in constant time complexity.
 */
export class LRUCache<K, V> {
  /**
   * contains the actual cache values
   */
  #cache = new Map<K, V>();

  /**
   * specifies the maximum allowed size of this cache, as configured on
   * instantiation.
   */
  #maxSize: number;

  constructor(maxSize: number) {
    this.#maxSize = maxSize;
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

    return value;
  }

  /**
   * inserts an entry into the cache, evicting the least recently used one if
   * maximum size has been reached
   */
  set(key: K, value: V): void {
    if (this.#cache.has(key)) {
      // if the entry already exists within the cache, then delete it to allow
      // re-insertion so it's tracked as recently used
      this.#cache.delete(key);
    } else if (this.#cache.size >= this.#maxSize) {
      // if the entry doesn't already exist and we've reached the maximum
      // allowed size, then delete the oldest key within the cache (relying on
      // the insertion order in the Map we're using behind the scenes)
      const oldestKey = this.#cache.keys().next().value;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.#cache.delete(oldestKey!);
    }

    this.#cache.set(key, value);
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
    this.#cache.delete(key);
  }

  /**
   * clear all entries from within the cache
   */
  clear() {
    this.#cache.clear();
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
  values() {
    return this.#cache.values();
  }

  /**
   * return the list of entries currently inserted into the cache
   */
  entries() {
    return this.#cache.entries();
  }
}
