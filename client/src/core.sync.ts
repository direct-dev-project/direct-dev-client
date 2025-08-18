import type { Deferred, HashSetJSON, LogLevel } from "@direct.dev/shared";
import {
  Logger,
  HashSet,
  readFromLocalStorage,
  writeToLocalStorage,
  makeDeferred,
  sha256,
  makeAsyncQueue,
  DirectBackoffManager,
  sortObject,
} from "@direct.dev/shared";
import { wire, applyPatch } from "@direct.dev/wire";

import type { DirectBlockHeightManager } from "./core.block-height.js";
import type { DirectCacheManager } from "./core.cache.js";
import type { DirectClockManager } from "./core.clock.js";
import type { DirectTelemetryManager } from "./core.telemetry.js";
import { persistedSyncStateSchema } from "./schemas.js";
import { DirectSyncStream } from "./sync.stream.js";

export type PersistedSyncState = {
  hashSet: HashSetJSON<DirectRequestHash>;
};

/**
 * duration after which a new sync stream will be opened by the client,
 * allowing rolling streams to ensure we never drop any events from Direct.dev
 * infrastructure.
 */
const ROLLING_STREAM_TIMEOUT_MS = 45_000;

/**
 * duration after which sync stream will be closed, if there has been no
 * request activity.
 */
const INACTIVITY_TIMEOUT_MS = 10_000;

/**
 * single-character op codes designating operations to be performed when
 * syncing local cache.
 */
export const syncCodes = {
  /**
   * prefix indicating a default patch that should be run against the raw
   * response.
   */
  defaultPatch: "0",

  /**
   * prefix indicating that a patch should be run in a block height agnostic
   * fashion
   */
  blockHeightAgnosticPatch: "1",

  /**
   * prefix indicating that only block height has changed between the previous
   * and the next version of the response.
   */
  blockHeightOnly: "2",

  /**
   * placeholder to be used when performing block height agnostic patching.
   */
  blockHeightPlaceholder: "\x00",
};

type Config = {
  logLevel: LogLevel;
  projectId: string;
  networkId: SupportedNetworkId;
  sessionId: string;

  /**
   * absolute URL to the state syncing endpoint
   */
  endpointUrl: string;

  /**
   * configuration of the preferred format to be applied when connecting to the
   * sync endpoint.
   */
  preferredFormat: "wire" | "ndjson";

  /**
   * if enabled, then faux events are added to Chrome devtools for all events
   * received through sync lines.
   */
  networkInspect: boolean;
};

/**
 * manages rolling connections of long-polling state sync streams, which allows
 * the client to keep up-to-date with current Direct.dev state.
 */
export class DirectSyncManager {
  #config: Config;
  #logger: Logger;

  #backoffManager: DirectBackoffManager;
  #blockHeightManager: DirectBlockHeightManager;
  #cacheManager: DirectCacheManager;
  #clockManager: DirectClockManager;
  #telemetryManager: DirectTelemetryManager;

  /**
   * queue to ensure that events are played back in the exact same order that
   * they're received.
   */
  #eventQueue = makeAsyncQueue();

  /**
   * specifies if the owning DirectRPCClient has been destroyed, allowing
   * abortion of operations.
   */
  #isDestroyed = false;

  /**
   * specifies if the manager has been stopped by the client (e.g. if the user
   * has left the browser tab)
   */
  #isStopped = true;

  /**
   * reference to the currently active stream
   */
  #currStream: DirectSyncStream | undefined;

  /**
   * reference to a pending "next" stream, which is held while we're waiting
   * for the new connection to be fully established
   */
  #nextStream: DirectSyncStream | undefined;

  /**
   * reference to the timeout used to perform automatic rolling of sync stream
   * connections.
   */
  #rollTimeout: NodeJS.Timeout | number | undefined;

  /**
   * shared set of hashes known by Direct.dev infrastructure, used to reliably
   * exchange synchronization status across layers.
   */
  #syncHashSet = new HashSet<DirectRequestHash>();

  /**
   * shared set of hashes that are automatically revalidated by Direct.dev
   * infrastructure, used to detect whether to bypass certain cache layers for
   * remote requests.
   */
  #revalidateHashSet = new HashSet<DirectRequestHash>();

  /**
   * mapping from shared request hash --> last known response hash, used when
   * applying patches.
   */
  #snapshotMap = new Map<
    DirectRequestHash,
    {
      responseHash: DirectResponseHash;
      blockHeight: RPCBlockHeight | null | undefined;
    }
  >();

  /**
   * internal reference to a promise, which can be used to wait for primer head
   * to be received prior to handling subsequent requests.
   */
  #waitForHead: Deferred<void> | undefined = makeDeferred();

  /**
   * timeout used to abort the waitForHead promise, allowing requests to flow
   * through to upstream without waiting for sync being established.
   */
  #waitForHeadTimeout: NodeJS.Timeout | number | undefined;

  /**
   * timeout used to re-try setup of state synchronization during periods of
   * exponential backoff.
   */
  #restartTimeout: NodeJS.Timeout | number | undefined;

  /**
   * timeout used to auto-stop sync requests if there are no request activity
   * for extended periods of time.
   */
  #inactiveTimeout: NodeJS.Timeout | number | undefined;

  /**
   * reference to the previously handled block height, so that patches can be
   * appended from there going forwards.
   */
  #snapshotBlockHeight: RPCBlockHeight | undefined;

  constructor(
    config: Config,
    blockHeightManager: DirectBlockHeightManager,
    cacheManager: DirectCacheManager,
    clockManager: DirectClockManager,
    telemetryManager: DirectTelemetryManager,
  ) {
    this.#config = config;
    this.#blockHeightManager = blockHeightManager;
    this.#cacheManager = cacheManager;
    this.#clockManager = clockManager;
    this.#telemetryManager = telemetryManager;

    this.#backoffManager = new DirectBackoffManager(
      {
        baseDurationMs: 1_000,
        cooldownMs: 15_000,
      },
      (evt) => {
        this.#telemetryManager.collectBackoffEvent({
          ...evt,
          source: "direct-sync",
        });
      },
    );

    this.#logger = new Logger({
      prefix: "Direct.dev: SyncManager:",
      level: config.logLevel,
      context: {
        projectId: config.projectId,
        networkId: config.networkId,
      },
    });
  }

  /**
   * determines if state synchronization is currently active within the client
   * or not.
   */
  isActive(): boolean {
    return this.#currStream !== undefined;
  }

  /**
   * trigger a request to Direct.dev layer, to fetch primer package to allow
   * local state syncing.
   */
  async start() {
    if (this.#isDestroyed) {
      throw new Error("DirectSyncManager.start(): instance destroyed");
    }

    clearTimeout(this.#restartTimeout);
    clearTimeout(this.#inactiveTimeout);

    this.#inactiveTimeout = setTimeout(() => {
      this.stop();
    }, INACTIVITY_TIMEOUT_MS);

    if (!this.#isStopped || this.#backoffManager.shouldBackOff(this.#config.endpointUrl)) {
      return;
    }

    this.#isStopped = false;
    this.#logger.debug("start", "establishing state synchronization, and requesting new primer package");

    //
    // STEP: create a promise which allows deferring subsequent requests, until
    // primer data has been resolved in-client
    //

    if (this.#waitForHead) {
      this.#waitForHead.then(() => {
        // clear pending promise once it's been resolved, so we don't need to
        // await anything in request flow
        this.#waitForHead = undefined;
        clearTimeout(this.#waitForHeadTimeout);
      });

      this.#waitForHeadTimeout = setTimeout(() => {
        // timeout after 1 second to avoid holding requests back needlessly long
        if (!this.#waitForHead?.__isFulfilled()) {
          this.#waitForHead?.__resolve();
          this.#logger.debug("start", "liveness not confirmed within timeout, continuing operations");
        }
      }, 500);
    }

    //
    // STEP: setup the state synchronization and subscribe to received updates,
    // to keep internal state updated correctly
    //

    this.#openStream({
      knownResponses: new Set(
        this.#syncHashSet
          .toArray()
          .map((it) => this.#snapshotMap.get(it)?.responseHash)
          .filter((it): it is NonNullable<typeof it> => !!it),
      ),
    });
  }

  /**
   * opens a new DirectSyncStream, and then stops the old line once the new
   * line has taken over.
   */
  #openStream(primer?: wire.SyncRequest["primer"]) {
    clearTimeout(this.#rollTimeout);

    // close any currently pending "nextStream" so we don't leak streams
    // this should never happen, it's defensive coding
    this.#nextStream?.stop();

    // open a new stream, and promote it to current once a connection has been
    // established
    this.#nextStream = new DirectSyncStream(this.#logger, this.#config);

    // collect bandwidth consumption used by sync streams immediately
    this.#nextStream.on("bandwidth", (data) => {
      this.#telemetryManager.collectBandwidthUsage({
        type: "sync",
        upload: data.upload,
        download: data.download,
      });
    });

    // start the sync stream as early as possible
    const startedAt = new Date();
    this.#nextStream.start(primer, this.#telemetryManager.consume());
    this.#nextStream.on("head", this.#handleHead.bind(this, startedAt));

    // wait for the stream to fully open and intersect with current stream (if
    // relevant), and then bind listeners
    this.#nextStream.on("open", async () => {
      if (this.#currStream && this.#nextStream) {
        await this.#waitForIntersection(this.#currStream, this.#nextStream);
      }

      // roll streams, so the previous one is abandoned
      this.#currStream?.stop();
      this.#currStream = this.#nextStream;
      this.#nextStream = undefined;

      // bind events from the new stream, so external integrations receive data
      // from the new line
      this.#currStream?.on("item", this.#handleResponse);
      this.#currStream?.on("event", this.#handleEvent);

      // schedule automatic rolling of the connection
      this.#scheduleRoll();
    });

    // propagate errors externally to allow client to respond to issues with
    // setting up state syncing
    this.#nextStream.on("error", (err) => {
      this.#handleError();
      this.#logger.debug("onError", "synchronization stream closed unexpectedly", { err });
    });

    // if the stream closed without yielding an actual error, then emit error
    // externally and log for debugging purposes
    this.#nextStream.on("close", () => {
      this.#handleError();
      this.#logger.debug("onClose", "synchronization stream closed unexpectedly");
    });
  }

  /**
   * bind interceptors for events on both current and next streams during
   * rolling, and wait until an event intersection has been observed to
   * guarantee rolling without dropping or re-emitting events.
   */
  async #waitForIntersection(currStream: DirectSyncStream, nextStream: DirectSyncStream) {
    // once the stream is opened, subscribe listeners to track events
    // received on next + current stream, and wait until the streams
    // intersect to ensure no events are dropped
    const currStreamEvents = new Map<Sha256String, wire.SyncEventStructure>();
    const nextStreamEvents = new Map<Sha256String, wire.SyncEventStructure>();

    // once intersection has been detected, allow events on next stream to be
    // emitted immediately while waiting for regular event listener to be bound
    let emitFromCurrStream = true;
    let emitFromNextStream = false;

    // helper to ensure that incoming events are handled sequentially across
    // both current and next streams, ensuring there are no race conditions
    const eventQueue = makeAsyncQueue();

    await new Promise<void>((resolve) => {
      currStream.on("event", async (evt) => {
        eventQueue(
          async () => {
            if (!emitFromCurrStream) {
              return;
            }

            const eventHash = await sha256(sortObject(evt));
            currStreamEvents.set(eventHash, evt);

            if (nextStreamEvents.has(eventHash)) {
              // if curr stream just caught up with "next", then emit all
              // future buffered events and perform roll immediately
              let isAhead = false;
              for (const [nextHash, nextEvent] of nextStreamEvents.entries()) {
                if (nextHash === eventHash) {
                  isAhead = true;
                }

                if (isAhead) {
                  this.#handleEvent(nextEvent);
                }
              }

              // stop fetching further events on the curr stream, we're about
              // to perform roll
              currStream.stop();

              clearTimeout(timeout);
              resolve();
              emitFromCurrStream = false;
              emitFromNextStream = true;
              return;
            }

            // handle events from current stream in real time while waiting
            // for rolling intersection
            this.#handleEvent(evt);
          },
          (err) => {
            this.#logger.error("#openStream", "an unknown error occurred while rolling stream, restarting connection", {
              err,
            });

            this.stop();
            this.start();
          },
        );
      });

      nextStream.on("event", (evt) => {
        eventQueue(
          async () => {
            const eventHash = await sha256(sortObject(evt));
            nextStreamEvents.set(eventHash, evt);

            if (currStreamEvents.has(eventHash)) {
              // if next stream just caught up with "curr", then drop all
              // events that were already handled through the curr stream
              for (const currHash of currStreamEvents.keys()) {
                currStreamEvents.delete(currHash);

                if (currHash === eventHash) {
                  break;
                }
              }

              // stop fetching further events on the curr stream, we're now
              // simply waiting for next stream to catch up
              currStream.stop();
              emitFromCurrStream = false;

              // if all events from currStream has been resolved, then resolve
              // the external promise and finalize roll
              if (currStreamEvents.size === 0) {
                clearTimeout(timeout);
                resolve();
                emitFromNextStream = true;
                return;
              }
            } else if (emitFromNextStream) {
              this.#handleEvent(evt);
            }
          },
          (err) => {
            this.#logger.error("#openStream", "an unknown error occurred while rolling stream, restarting connection", {
              err,
            });

            this.stop();
            this.start();
          },
        );
      });

      // force roll after 3 seconds if no intersection was observed (which
      // would happen due to inactivity on the stream)
      //
      // in the extremely unlikely scenario of wrong event ordering slipping
      // through, automatic reconnection will ensure correct syncing of the
      // client on a fresh stream
      const timeout = setTimeout(() => resolve(), 3_000);
    });

    currStreamEvents.clear();
    nextStreamEvents.clear();
  }

  /**
   * stop synchronization of state, terminating any open streams until next
   * timeout
   */
  stop() {
    if (this.#isDestroyed) {
      throw new Error("DirectSyncManager.stop(): instance destroyed");
    }

    this.#currStream?.stop();
    this.#nextStream?.stop();

    this.#isStopped = true;
    this.#currStream = undefined;
    this.#nextStream = undefined;

    // reset event queue, so that future events in case of restarted
    // connections do not depend on previous state
    this.#eventQueue = makeAsyncQueue();

    clearTimeout(this.#rollTimeout);
    clearTimeout(this.#restartTimeout);
    clearTimeout(this.#inactiveTimeout);
  }

  /**
   * handle errors in state synchronization, stopping currently running streams
   * and re-opening a new one after a slight back-off.
   */
  async #handleError() {
    this.stop();

    const backOffMs = this.#backoffManager.handleFailure(this.#config.endpointUrl);

    clearTimeout(this.#restartTimeout);
    this.#restartTimeout = setTimeout(() => {
      this.start();
    }, backOffMs + 1);
  }

  /**
   * handle incoming primer package head, allowing initial state bootstrapping.
   */
  #handleHead = (t1: Date, data: wire.SyncHead) => {
    this.#eventQueue(
      async () => {
        if (data.clock) {
          // if clock data was received, then update offset within the clock
          // manager for subsequent usage when handling cache expiration
          this.#clockManager.updateOffset(t1, data.clock.t2, data.clock.t3);
        }

        if (!data.blockHeight) {
          // if we received an empty head, it's a ping to indicate liveness of
          // the Direct.dev upstream; reschedule timeout of head promise to
          // allow another 500ms
          clearTimeout(this.#waitForHeadTimeout);

          this.#waitForHeadTimeout = setTimeout(() => {
            // timeout after 1 second to avoid holding requests back needlessly
            // long
            if (!this.#waitForHead?.__isFulfilled()) {
              this.#waitForHead?.__resolve();
              this.#logger.debug("start", "head not received within timeout, continuing operations");
            }
          }, 500);
          return;
        }

        this.#blockHeightManager.setCurrent(data.blockHeight, new Date(Date.now() + 3_000));

        if (data.pendingBlockHeight) {
          this.#blockHeightManager.setPending(
            data.pendingBlockHeight.blockHeight,
            data.pendingBlockHeight.propagatesAt,
          );
        }

        this.#snapshotBlockHeight = data.pendingBlockHeight?.blockHeight ?? data.blockHeight;

        if (data.primer) {
          // apply cache mapping internally, and prepare inflight promises on
          // imminent requests if they're on already present in local cache
          // layer
          data.primer.requestToResponseMap.forEach((entry) => {
            this.#cacheManager.mapRequestToResponse(
              data.blockHeight,
              entry.requestHash,
              entry.responseHash,
              entry.expiresAt,
            );
            this.#cacheManager.openInflightResponse(entry.responseHash);
            this.#snapshotMap.set(entry.requestHash, {
              responseHash: entry.responseHash,
              blockHeight: data.blockHeight,
            });
          });
        }

        if (!this.#waitForHead?.__isFulfilled()) {
          this.#waitForHead?.__resolve(undefined);
        }

        if (data.primer) {
          // clean up repsonse map, so we do not leak stale keys
          this.#snapshotMap.keys().forEach((requestHash) => {
            if (!this.#syncHashSet.has(requestHash)) {
              this.#snapshotMap.delete(requestHash);
            }
          });

          // update local request hash set, so that we can safely
          // compare request indexes across environments
          await this.#syncHashSet.applyUpdate(data.primer.syncSet);
          await this.#revalidateHashSet.applyUpdate(data.primer.revalidateSet);
        }
      },
      (err) => {
        this.#logger.error("#handleHead", "an unknown error occurred, backing off", { err });
        return this.#handleError();
      },
    );
  };

  /**
   * handle incoming baseline updates, ensuring that they're applied to local
   * cache manager for future reference
   */
  #handleResponse = (response: DirectRPCResultResponse) => {
    this.#eventQueue(
      async () => {
        await this.#cacheManager.handleResponse(response);
      },
      (err) => {
        this.#logger.error("#handleResponse", "an unknown error occurred, restarting connection", { err });

        this.stop();
        this.start();
      },
    );
  };

  /**
   * handle incoming synchronization events sent from Direct.dev infrastructure
   * to keep client updated.
   */
  #handleEvent = (evt: wire.SyncEventStructure) => {
    this.#eventQueue(
      async () => {
        this.#logger.verbose("#handleEvent", "received event", evt);

        // schedule automatic restart of sync line, if no events are received
        // for a while
        if (!this.#isStopped) {
          clearTimeout(this.#restartTimeout);
          this.#restartTimeout = setTimeout(() => {
            this.#logger.debug("#handleEvent", "no events received for at least 2 seconds, restarting connection...");

            this.stop();
            this.start();
          }, 2_500);
        }

        switch (evt.event) {
          case "ping":
            this.#blockHeightManager.setCurrent(evt.data.blockHeight, evt.data.expiresAt);
            break;

          case "block-height.change":
            this.#snapshotBlockHeight = evt.data.blockHeight;
            this.#blockHeightManager.setPending(evt.data.blockHeight, evt.data.propagatesAt);
            break;

          case "block-height.promote":
            this.#blockHeightManager.promotePending(evt.data.blockHeight);
            break;

          case "cache.delta":
            if (
              (await this.#syncHashSet.applyDelta(evt.data.syncSet)) === false ||
              (await this.#revalidateHashSet.applyDelta(evt.data.revalidateSet)) === false
            ) {
              // break sync connection and try to re-open a new line again
              // instantly to bring state fully up-to-date
              this.#logger.warn("#handleEvent", "unable to apply delta to hash sets, re-opening connection", evt.data);

              this.stop();
              this.start();

              return;
            }

            // if we successfully patched request hash set, then ensure that
            // baseline is cleaned up to avoid stale values
            this.#snapshotMap.keys().forEach((requestHash) => {
              if (!this.#syncHashSet.has(requestHash)) {
                this.#snapshotMap.delete(requestHash);
              }
            });
            break;

          case "cache.continuation": {
            //
            // STEP: apply continuation instructions to local cache
            //
            const entries = await Promise.all([
              ...evt.data.unchanged.map((entry) => {
                const requestHash = this.#syncHashSet.getHashByIndex(entry.requestIndex);

                if (requestHash == null) {
                  // bail out if requestHash or responseHash could not be
                  // correctly inferred based on current state
                  return;
                }

                // look up previous response
                const prevResponseHash = this.#snapshotMap.get(requestHash)?.responseHash;
                const prevResponse = prevResponseHash
                  ? this.#cacheManager.getByResponseHash(prevResponseHash)
                  : undefined;

                if (!prevResponse || !prevResponseHash) {
                  // if the previous response doesn't exist, then bail out -
                  // there is nothing to patch...
                  return;
                }

                return {
                  ...entry,
                  requestHash,
                  responseHash: prevResponseHash,
                  response: prevResponse,
                };
              }),

              ...evt.data.patches.map(async (entry) => {
                const requestHash = this.#syncHashSet.getHashByIndex(entry.requestIndex);

                if (requestHash == null) {
                  // bail out if requestHash or responseHash could not be
                  // correctly inferred based on current state
                  return;
                }

                const response = this.#applyPatch(this.#snapshotBlockHeight, requestHash, entry.patchStr);

                if (!response) {
                  // if the response couldn't be patched, then bail out
                  return;
                }

                return {
                  ...entry,
                  requestHash,
                  responseHash: await wire.hashRPCResponse(response),
                  response,
                };
              }),

              ...evt.data.replacements.map(async (entry) => {
                const requestHash = this.#syncHashSet.getHashByIndex(entry.requestIndex);

                if (requestHash == null) {
                  // bail out if requestHash or responseHash could not be
                  // correctly inferred based on current state
                  return;
                }

                return {
                  ...entry,
                  requestHash,
                  responseHash: await wire.hashRPCResponse(entry.response),
                  response: entry.response,
                };
              }),
            ]).then((it) => it.filter((it): it is NonNullable<typeof it> => !!it));

            //
            // STEP: verify output checksum before committing updates to memory
            //
            const blockHeight = this.#snapshotBlockHeight;
            const requestHashes = entries
              .map((it) => it.requestHash)
              .sort()
              .join(",");
            const responseHashes = entries
              .map((it) => it.responseHash)
              .sort()
              .join(",");

            const checksum = await sha256(
              this.#syncHashSet.getChecksum() + blockHeight + requestHashes + responseHashes,
            );

            if (checksum !== evt.data.checksum) {
              // in case of output mismatches, then break sync connection and
              // try to re-open a new line to instantly bring state syncing
              // fully up-to-date
              this.#logger.warn("#handleEvent", "unable to verify cache continuation checksum, restarting connection");

              this.stop();
              this.start();
              return;
            }

            //
            // STEP: commit continuation in-memory
            //
            entries.forEach((entry) => {
              if (!entry) {
                return;
              }

              this.#cacheManager.handleResponse(entry.response);
              this.#cacheManager.mapRequestToResponse(
                blockHeight,
                entry.requestHash,
                entry.responseHash,
                entry.expiresAt,
              );

              // cache mapping of request to response hash for future reference
              this.#snapshotMap.set(entry.requestHash, {
                responseHash: entry.responseHash,
                blockHeight: this.#snapshotBlockHeight,
              });
            });
            break;
          }
        }
      },
      (err) => {
        this.#logger.error("#handleEvent", "an unknown error occurred, restarting connection", { err });

        this.stop();
        this.start();
      },
    );
  };

  /**
   * utility to compute continuation entry -> next response before commiting
   * the new entry to memory in the cache manager.
   */
  #applyPatch(
    blockHeight: RPCBlockHeight | undefined,
    requestHash: DirectRequestHash,
    patchStr: string,
  ): DirectRPCResultResponse | undefined {
    // look up previous response
    const prevSnapshot = this.#snapshotMap.get(requestHash);
    const prevResponse = prevSnapshot ? this.#cacheManager.getByResponseHash(prevSnapshot.responseHash) : undefined;

    if (!prevResponse) {
      // if the previous response doesn't exist, then bail out - there is
      // nothing to patch...
      return;
    }

    // apply the patch on JSON response representation
    const prevJson = JSON.stringify(prevResponse.result);

    switch (patchStr.charAt(0)) {
      // perform default patching on raw data
      case syncCodes.defaultPatch: {
        const nextJson = applyPatch(prevJson, patchStr, 1);

        return {
          ...prevResponse,
          result: JSON.parse(nextJson),
        };
      }

      // block height agnostic patches need to be applied in a fashion which
      // allows us to
      case syncCodes.blockHeightAgnosticPatch: {
        const fromBlockHeight = (prevSnapshot?.blockHeight ?? "").replace(BLOCK_HEIGHT_START_REGEX, "");
        const toBlockHeight = (blockHeight ?? "").replace(BLOCK_HEIGHT_START_REGEX, "");

        const nextJson = applyPatch(
          prevJson.replaceAll(fromBlockHeight, syncCodes.blockHeightPlaceholder),
          patchStr,
          1,
        ).replaceAll(syncCodes.blockHeightPlaceholder, toBlockHeight);

        return {
          ...prevResponse,
          result: JSON.parse(nextJson),
        };
      }

      // basic replacement of block height only
      case syncCodes.blockHeightOnly: {
        const fromBlockHeight = (prevSnapshot?.blockHeight ?? "").replace(BLOCK_HEIGHT_START_REGEX, "");
        const toBlockHeight = (blockHeight ?? "").replace(BLOCK_HEIGHT_START_REGEX, "");

        return {
          ...prevResponse,
          result: JSON.parse(prevJson.replaceAll(fromBlockHeight, toBlockHeight)),
        };
      }
    }
  }

  /**
   * schedule rolling connections, where a new stream is started shortly before
   * the old one expires
   */
  #scheduleRoll() {
    clearTimeout(this.#rollTimeout);

    this.#rollTimeout = setTimeout(() => {
      this.#openStream();
    }, ROLLING_STREAM_TIMEOUT_MS);
  }

  /**
   * check if the given request is currently revalidated by Direct.dev
   * infrastructure.
   */
  isRevalidated(requestHash: DirectRequestHash) {
    if (this.#isDestroyed) {
      throw new Error("DirectSyncManager.getHashSet(): instance destroyed");
    }

    return this.#syncHashSet.has(requestHash) || this.#revalidateHashSet.has(requestHash);
  }

  /**
   * returns a promise which will resolve once primer head has been received
   * (if one is currently pending)
   */
  wait(): MaybePromise<void> {
    if (this.#isDestroyed) {
      throw new Error("DirectSyncManager.waitForHead(): instance destroyed");
    }

    return this.#waitForHead;
  }

  /**
   * Destroy this client instance, preventing any further requests from being
   * dispatched to the Direct.dev infrastructure.
   */
  destroy() {
    // prevent starting/stopping sync streams accidentally after having
    // destroyed the instance
    clearTimeout(this.#restartTimeout);

    // stop any currently running sync stream
    this.stop();

    // register that the instance has been destroyed
    this.#isDestroyed = true;
  }

  /**
   * utility to cache current hashSet to localStorage, so it can be restored on
   * subsequent visits
   */
  persistState() {
    if (this.#isDestroyed) {
      throw new Error("DirectSyncManager.persistState(): instance destroyed");
    }

    const state: PersistedSyncState = {
      hashSet: this.#syncHashSet.toJSON(),
    };

    writeToLocalStorage(getLocalStorageKey(this.#config), JSON.stringify(state));
  }

  /**
   * utility to restore in-memory hashSet from persistent storage, used to allow
   * sharing data across sessions in a browser-based environment.
   */
  restoreState() {
    if (this.#isDestroyed) {
      throw new Error("DirectSyncManager.restoreHashSet(): instance destroyed");
    }

    try {
      const statePayload = readFromLocalStorage(getLocalStorageKey(this.#config));

      if (statePayload) {
        const state = persistedSyncStateSchema(JSON.parse(statePayload));

        this.#syncHashSet = new HashSet(state.hashSet);
      }
    } catch {
      // silently ignore parse errors, and continue operations with existing
      // (empty) hashSet
    }
  }
}

function getLocalStorageKey(config: Config): string {
  return `direct.dev__${config.projectId}:${config.networkId}__syncManager`;
}

const BLOCK_HEIGHT_START_REGEX = /^0x/;
