import type { Logger } from "@direct.dev/shared";

/**
 * A minimal async IndexedDB string store with lazy open, retry on failure,
 * and methods for get, set, and delete.
 */
export type CacheDatabase = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  setMany(entries: Array<{ key: string; value: string }>): Promise<void>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  getAll(): AsyncGenerator<[key: string, value: string]>;
};

/**
 * Creates a CacheDatabase abstraction, which allows accessing IndexedDB in a
 * simple fashion to add persistent caching of responses.
 */
export function makeDB(logger: Logger, projectId: string, networkId: string): CacheDatabase {
  const dbName = "direct.dev_" + projectId + "_" + networkId;

  let db: IDBDatabase | undefined;
  let openingDB: Promise<IDBDatabase | undefined> | undefined;
  let backoff = 100;

  /**
   * Opens the database, creating the object store if needed.
   * Ensures only one open attempt is in progress.
   */
  function openDB(): MaybePromise<IDBDatabase | undefined> {
    if (typeof indexedDB === "undefined") {
      // feature detection; bail out early if current runtime environment
      // doesn't support using IndexedDB
      return;
    }

    if (db) {
      return db;
    }

    if (openingDB) {
      // if we're already trying to open a connection, then return existing
      // promise
      return openingDB;
    }

    // if a connection to the database wasn't opened yet, then do so now
    openingDB = new Promise((resolve) => {
      const req = indexedDB.open(dbName);

      req.onupgradeneeded = () => {
        // make sure the object store is created when needed
        req.result.createObjectStore("cache");
      };

      req.onsuccess = () => {
        // cache the connection on success
        db = req.result;
        openingDB = undefined;

        db.onversionchange = () => {
          logger.warn("makeDB", "versionchange event triggered, closing DB connection");
          req.result.close();
        };

        db.onclose = () => {
          // reset state
          db = undefined;
        };

        // reset backoff after successful state
        backoff = 100;
        resolve(db);
      };

      req.onerror = (evt) => {
        logger.warn("makeDB", "unable to open IndexedDB for persistent cache", { evt });

        // reset the external promise, so we can try to re-connect again after
        // the specified backoff
        setTimeout(() => {
          openingDB = undefined;
        }, backoff);

        // exponential backoff for failed connections
        backoff = Math.min(backoff * 2, 2000);

        // resolve external promise without delivering access to the database
        resolve(undefined);
      };
    });

    return openingDB;
  }

  /**
   * Runs an operation against the IndexedDB objectStore.
   */
  async function runTransaction<T>(
    mode: IDBTransactionMode,
    db: (store: IDBObjectStore) => IDBRequest<T> | undefined,
  ): Promise<T | undefined> {
    try {
      const database = await openDB();

      if (!database) {
        return undefined;
      }

      return new Promise<T | undefined>((resolve, reject) => {
        // run the request against the network object store
        const tx = database.transaction("cache", mode);
        const store = tx.objectStore("cache");
        const request = db(store);

        // handle resolution of external promise, when the transaction completes
        if (!request) {
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => {
            logger.warn("makeDB", "transaction error", { err: tx.error });
            reject(tx.error);
          };
        } else {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            logger.warn("makeDB", "request error", { err: request.error });
            reject(request.error);
          };
        }

        // handle aborted transactions
        tx.onabort = () => {
          logger.warn("makeDB", "transaction aborted", { err: tx.error });
          reject(tx.error);
        };
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  return {
    /**
     * Reads a string value by key.
     */
    async get(key) {
      return runTransaction("readonly", (store) => store.get(key));
    },

    /**
     * Iterates over all key-value pairs in the store.
     */
    async *getAll(): AsyncGenerator<[key: string, value: string]> {
      const database = await openDB();

      if (!database) {
        return;
      }

      const tx = database.transaction("cache", "readonly");
      const store = tx.objectStore("cache");
      const request = store.openCursor();

      while (true) {
        const cursor = await new Promise<IDBCursorWithValue | null>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            logger.warn("makeDB", "cursor error", { err: request.error });
            reject(request.error);
          };
        });

        if (!cursor) {
          break;
        }

        yield [String(cursor.key), String(cursor.value)] as const;

        cursor.continue();
      }
    },

    /**
     * Stores a string value by key.
     */
    async set(key, value) {
      await runTransaction("readwrite", (store) => store.put(value, key));
    },

    /**
     * Stores a batch of entries in a single transaction
     */
    async setMany(entries) {
      await runTransaction("readwrite", (store) => {
        let lastRequest: IDBRequest | undefined;

        for (const { key, value } of entries) {
          lastRequest = store.put(value, key);
        }

        return lastRequest;
      });
    },

    /**
     * Deletes a key from the store.
     */
    async delete(key) {
      await runTransaction("readwrite", (store) => store.delete(key));
    },

    /**
     * Deletes many keys from the store in a single transaction.
     */
    async deleteMany(keys) {
      await runTransaction("readwrite", (store) => {
        let lastRequest: IDBRequest | undefined;

        for (const key of keys) {
          lastRequest = store.delete(key);
        }

        return lastRequest;
      });
    },
  };
}
