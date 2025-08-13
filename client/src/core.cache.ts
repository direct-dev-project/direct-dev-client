import type { Deferred } from "@direct.dev/shared";
import { getBlockHeightParam, LRUByteSizeCache, LRUCache, makeDeferred, normalizeRPCMethod } from "@direct.dev/shared";
import { wire } from "@direct.dev/wire";

import type { DirectClockManager } from "./core.clock.js";
import { estimateResponseSize } from "./util.estimate-object-size.js";

/**
 * timeout after which inflight promises are considered stale and forcibly
 * closed to prevent sharing stale request promises.
 */
const INFLIGHT_REQUEST_TIMEOUT_MS = 3_000;

/**
 * timeout after which we give up waiting on responses from state syncing
 * mechanisms.
 */
const INFLIGHT_RESPONSE_TIMEOUT_MS = 750;

export class DirectCacheManager {
  #clockManager: DirectClockManager;
  #isDestroyed = false;

  /**
   * internal mapping of cacheKey --> responseHash, which is used to perform
   * request cache lookups and apply shared caching across block heights when
   * data doesn't change.
   */
  #requestToResponseMap = new LRUCache<DirectCacheKey, { responseHash: DirectResponseHash; expiresAt: Date }>(25_000);

  /**
   * collection of currently inflight requests, contained here to allow
   * de-duplication of multiple identical requests sent in quick succession.
   */
  #inflightRequests = new Map<
    DirectCacheKey,
    Array<{
      createdAt: Date;
      promise: Deferred<DirectRPCResultResponse | DirectRPCErrorResponse>;
    }>
  >();

  /**
   * collection of response hashes which are known to be inbound through state
   * syncing.
   */
  #inflightResponses = new Map<
    DirectResponseHash,
    Deferred<DirectRPCResultResponse | DirectRPCErrorResponse | undefined>
  >();

  /**
   * caching of response hash --> full response body, used to perform final
   * lookup of response values, allowing multiple cache keys to share the same
   * response from in-memory cache when there haven't been any changes.
   */
  #memoryCache: LRUByteSizeCache<DirectResponseHash, DirectRPCResultResponse>;

  constructor(clockManager: DirectClockManager) {
    this.#clockManager = clockManager;
    this.#memoryCache = new LRUByteSizeCache(5 * 1024 * 1024);
  }

  /**
   * internal helper to translate a raw JSON-RPC request into it's designated
   * cache key for further lookups.
   */
  async getCacheKey(
    requestBody: DirectRPCRequest,
    blockHeight: RPCBlockHeight | undefined,
  ): Promise<[DirectCacheKey, DirectRequestHash]> {
    const requestMethod = normalizeRPCMethod(requestBody.method);
    const blockHeightParam = getBlockHeightParam({ requestBody, requestMethod });

    switch (blockHeightParam) {
      case "latest":
      case blockHeight ?? "-": {
        // for requests targetting "latest" block height, ensure consistent
        // cache key usage to allow correct matching for predictively prefetched
        // requests
        const requestHash = await wire.hashRPCRequest({
          requestBody,
          requestMethod,
          overrideBlockHeight: "latest",
        });

        return [`${requestHash}:${blockHeight as RPCBlockHeight}`, requestHash];
      }

      case "finalized":
      case "safe": {
        // for requests targetting other block height tags, ensure that caching
        // is tied to current block height
        const requestHash = await wire.hashRPCRequest({
          requestBody,
          requestMethod,
        });

        return [`${requestHash}:${blockHeight as RPCBlockHeight}`, requestHash];
      }

      case undefined:
      case "earliest": {
        // for requests that aren't targetting custom block heights, allow them
        // to be cached until expiration timestamp regardless of current block
        // height
        const requestHash = await wire.hashRPCRequest({
          requestBody,
          requestMethod,
        });

        return [requestHash, requestHash];
      }

      case "pending": {
        // pending block height is considered uncacheable; create a stable key
        // for inflight uniqueness, but do not attempt to tie to current block
        // height as pending is inherently disconnected from stable blocks
        const requestHash = await wire.hashRPCRequest({
          requestBody,
          requestMethod,
        });

        return [requestHash, requestHash];
      }

      default: {
        if (blockHeight) {
          const currBlockNumber = BigInt(blockHeight);
          const requestBlockNumber = BigInt(blockHeightParam);

          if (requestBlockNumber < currBlockNumber && requestBlockNumber >= currBlockNumber - 12n) {
            // for blocks requesting a specific, recent block height, ensure
            // that they're hashed under "latest" block height - we assume that
            // the request was simply made using a stale value
            const requestHash = await wire.hashRPCRequest({
              requestBody,
              requestMethod,
              overrideBlockHeight: "latest",
            });

            return [`${requestHash}:${blockHeightParam}`, requestHash];
          }
        }

        // if requesting an older block, consider it stable and immutable when
        // generating cache key
        const requestHash = await wire.hashRPCRequest({
          requestBody,
          requestMethod,
        });

        return [requestHash, requestHash];
      }
    }
  }

  /**
   * read an entry from local cache (if it exists)
   */
  getFromMemory(cacheKey: DirectCacheKey): DirectRPCResultResponse | undefined {
    const cacheMapping = this.#requestToResponseMap.get(cacheKey);

    if (cacheMapping == null || this.#clockManager.isPast(cacheMapping.expiresAt)) {
      // bail out early if the mapping has expired, as we cannot reliably
      // guarantee freshness
      return undefined;
    }

    return this.#memoryCache.get(cacheMapping.responseHash);
  }

  /**
   * read an entry from inflight request/response entries, and resolve with
   * whatever becomes available the fastest
   */
  getInflight(
    cacheKey: DirectCacheKey,
  ): Promise<DirectRPCResultResponse | DirectRPCErrorResponse | undefined> | undefined {
    if (this.#isDestroyed) {
      throw new Error("DirectCacheManager.get(): instance destroyed");
    }

    const inflightRequest = this.#inflightRequests.get(cacheKey)?.at(-1);

    if (inflightRequest && inflightRequest.createdAt.getTime() > Date.now() - INFLIGHT_REQUEST_TIMEOUT_MS) {
      // if this request is currently in-flight, then re-use existing promise
      // value
      return inflightRequest.promise;
    }

    const cacheMapping = this.#requestToResponseMap.get(cacheKey);

    if (cacheMapping == null || this.#clockManager.isPast(cacheMapping.expiresAt)) {
      // bail out early if the mapping has expired, as we cannot reliably
      // guarantee freshness
      return undefined;
    }

    return this.#inflightResponses.get(cacheMapping.responseHash);
  }

  /**
   * get currently cached response for a given hash from memory.
   */
  getByResponseHash(responseHash: DirectResponseHash): DirectRPCResultResponse | undefined {
    return this.#memoryCache.get(responseHash);
  }

  /**
   * apply mapping of cacheKey --> responseHash for the given request.
   *
   * @note this method always applies the mapping both tied to current block
   *       height, and as the latest response for this request in general (the
   *       latter allows lookup of last known response hash on any given
   *       request)
   */
  mapRequestToResponse(
    blockHeight: RPCBlockHeight | null | undefined,
    requestHash: DirectRequestHash,
    responseHashOrUnchanged: DirectResponseHash | undefined,
    expiresAt: Date,
  ) {
    if (this.#isDestroyed) {
      throw new Error("DirectCacheManager.mapRequestToResponse(): instance destroyed");
    }

    const responseHash = responseHashOrUnchanged ?? this.#requestToResponseMap.get(requestHash)?.responseHash;

    if (responseHash == null) {
      // if responseHash could not be resolved in case of unchanged value, then
      // bail out - we cannot reliably perform mapping
      return;
    }

    this.#requestToResponseMap.set(requestHash, { responseHash, expiresAt });

    if (blockHeight != null) {
      this.#requestToResponseMap.set(`${requestHash}:${blockHeight}`, { responseHash, expiresAt });
    }
  }

  /**
   * track currently inflight requests, opening a promise which will be re-used
   * for identical requests triggered in quick succession.
   */
  openInflightRequest(cacheKey: DirectCacheKey) {
    if (this.#isDestroyed) {
      throw new Error("DirectCacheManager.trackInflightRequest(): instance destroyed");
    }

    // create the inflight promise
    const inflightPromise = makeDeferred<DirectRPCErrorResponse | DirectRPCResultResponse>();

    // ensure that inflight uniqueness is terminated once response is received
    inflightPromise.finally(() => {
      this.#inflightRequests.delete(cacheKey);
    });

    // cache the promise for subsequent reference
    this.#inflightRequests.set(cacheKey, [
      ...(this.#inflightRequests.get(cacheKey) ?? []),
      { promise: inflightPromise, createdAt: new Date() },
    ]);

    return inflightPromise;
  }

  /**
   * track currently inflight responses (ie. data that will be delivered
   * shortly through state syncing), opening a promise which will be used for
   * requests mapped to this response until actual data is delivered.
   */
  openInflightResponse(responseHash: DirectResponseHash) {
    if (this.#isDestroyed) {
      throw new Error("DirectCacheManager.trackInflightResponse(): instance destroyed");
    }

    // create the inflight promise
    const inflightPromise = makeDeferred<DirectRPCErrorResponse | DirectRPCResultResponse | undefined>();

    // ensure that inflight uniqueness is terminated once response is received
    inflightPromise.finally(() => {
      this.#inflightResponses.delete(responseHash);
      clearTimeout(timeout);
    });

    // stop re-using the same inflight promise if it has still not resolved
    // after a while to avoid waiting for responses that are never delivered
    // through state syncing (this should never happen, it's defensive coding)
    const timeout = setTimeout(() => {
      if (!inflightPromise.__isFulfilled()) {
        inflightPromise.__resolve(undefined);
      }
    }, INFLIGHT_RESPONSE_TIMEOUT_MS);

    // cache the promise for subsequent reference
    this.#inflightResponses.set(responseHash, inflightPromise);
  }

  /**
   * handle RPC responses, allowing in-memory caching of observed responses
   */
  async handleResponse(
    response: DirectRPCResultResponse | DirectRPCErrorResponse,
    cacheKey?: DirectCacheKey,
  ): Promise<DirectResponseHash> {
    if (this.#isDestroyed) {
      throw new Error("DirectCacheManager.handleResponse(): instance destroyed");
    }

    //
    // STEP: resolve any currently inflight requests for response
    //
    if (cacheKey) {
      this.#inflightRequests.get(cacheKey)?.forEach((inflightRequest) => {
        if (!inflightRequest.promise.__isFulfilled()) {
          inflightRequest.promise.__resolve(response);
        }
      });
    }

    //
    // STEP: resolve any currently inflight responses matching this hash
    //
    const responseHash = await wire.hashRPCResponse(response);
    const inflightResponse = this.#inflightResponses.get(responseHash);

    if (inflightResponse && !inflightResponse.__isFulfilled()) {
      // if there's a currently pending promise associated with this response,
      // then resolve it with correct value now
      inflightResponse.__resolve(response);
    }

    //
    // STEP: write response to cache if it was successful
    //
    if ("result" in response) {
      this.#memoryCache.set(responseHash, response, estimateResponseSize(response));
    }

    return responseHash;
  }

  /**
   * handle destruction of the client, ensuring that in-memory constructs will
   * be correctly flushed
   */
  destroy() {
    this.#isDestroyed = true;

    // reject pending inflight handling
    this.#inflightRequests.values().forEach((deferreds) => {
      deferreds.forEach((deferred) => {
        if (!deferred.promise.__isFulfilled()) {
          deferred.promise.__resolve({
            id: 1,
            error: {
              code: 85001,
              message: "failed to receive response, client was destroyed (Direct.dev)",
            },
          });
        }
      });
    });

    this.#inflightResponses.values().forEach((deferred) => {
      if (!deferred.__isFulfilled()) {
        deferred.__resolve(undefined);
      }
    });

    // clear all in-memory constructions to allow garbage collection
    this.#requestToResponseMap.clear();
    this.#inflightRequests.clear();
    this.#inflightResponses.clear();
    this.#memoryCache.clear();
  }
}
