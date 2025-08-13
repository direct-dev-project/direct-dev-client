/**
 * Simple manager used to handle comparison of dates from Direct.dev
 * infrastructure with local client time.
 */
export class DirectClockManager {
  /**
   * millisecond time offset between local client and Direct.dev
   * infrastructure, used to ensure correctness when comparing timestamps for
   * cache expiration.
   *
   * @note until an offset has been computed from observations from
   * DirectSyncManager, this offset is Infinity which creates the assumption
   * that client is _always_ ahead of server (effectively eliminating all
   * local caching until we can reliably ensure expiration is handled correctly
   * regardless of potential time skew).
   */
  #offsetMs = Infinity;

  /**
   * historical delays in receiving clock offsets, used to ensure that we only
   * update offset when network delay is low.
   */
  #delaysMs: number[] = [];

  /**
   * NTP inspired clock offset calculation between client and Direct.dev
   * infrastructure.
   *
   * @param t1 - client send timestamp
   * @param t2 - server receive timestamp
   * @param t3 - server send timestamp
   *
   * @note client receive timestamp is inferred to be the time of calling this
   * method.
   */
  updateOffset(t1: Date, t2: Date, t3: Date): void {
    // NTP inspired calculation of clock offset and network delay
    const t1Ms = t1.getTime();
    const t2Ms = t2.getTime();
    const t3Ms = t3.getTime();
    const t4Ms = Date.now();

    const offsetMs = (t2Ms - t1Ms + (t3Ms - t4Ms)) / 2;
    const delayMs = t4Ms - t1Ms - (t3Ms - t2Ms);

    // track historical delays
    this.#delaysMs.push(delayMs);

    while (this.#delaysMs.length > 8) {
      this.#delaysMs.shift();
    }

    // compute median delay, and accept offset only if delay is better than
    // median
    const medianDelayMs =
      [...this.#delaysMs].sort((a, b) => a - b).at(Math.floor(this.#delaysMs.length * 0.5)) ?? Infinity;

    if (delayMs <= medianDelayMs) {
      this.#offsetMs = offsetMs;
    }
  }

  /**
   * computes the delta between the server timestamp and client time, taking
   * into account the current offset between client and server.
   */
  computeDelta(serverTime: Date, clientTime = new Date()) {
    const clientTimeMs = clientTime.getTime() + this.#offsetMs;
    const serverTimeMs = serverTime.getTime();

    return serverTimeMs - clientTimeMs;
  }

  /**
   * determines if the given server timestamp is ahead of current client time.
   */
  isFuture(serverTime: Date, clientTime = new Date()) {
    return this.computeDelta(serverTime, clientTime) > 0;
  }

  /**
   * determines if the given server timestamp is behind of current client time.
   */
  isPast(serverTime: Date, clientTime = new Date()) {
    return this.computeDelta(serverTime, clientTime) < 0;
  }
}
