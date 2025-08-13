import { isBlockHeightAhead } from "@direct.dev/shared";

import type { DirectClockManager } from "./core.clock.js";

/**
 * utility to manage retention of current and pending block height, while
 * guaranteeing that the DirectRPCClient does not extend lifetime further than
 * what can be guaranteed valid by Direct.dev infrastructure.
 */
export class DirectBlockHeightManager {
  #clockManager: DirectClockManager;

  /**
   * contains the current block height
   */
  #current: { value: RPCBlockHeight; expiresAt: Date } | undefined;

  /**
   * contains currently pending block height (if any)
   */
  #pending: { value: RPCBlockHeight; propagatesAt: Date } | undefined;

  /**
   * contains the currently applied minimum block height to return; if
   * applicable this will ensure that no current/pending values are returned
   * unless they're greater than this value.
   */
  #minimum: RPCBlockHeight | undefined;

  /**
   * reference to the onChange handler provided when instantiating the class,
   * allowing us to propagate block height change events.
   */
  #onChangeHandler: ((blockHeight: RPCBlockHeight, expiresAt: Date) => void) | undefined;

  /**
   * timeout used to trigger promotion of pending block heights at the desired
   * timestamp.
   */
  #promotePendingTimeout: NodeJS.Timeout | number | undefined;

  constructor(clockManager: DirectClockManager, onChange?: (blockHeight: RPCBlockHeight, expiresAt: Date) => void) {
    this.#clockManager = clockManager;
    this.#onChangeHandler = onChange;
  }

  /**
   * returns currently known block height, if one is available which is still
   * guaranteed to be valid.
   */
  getCurrent(): RPCBlockHeight | undefined {
    this.#maybePromotePending();

    const blockHeight =
      this.#current && this.#clockManager.isFuture(this.#current.expiresAt) ? this.#current.value : undefined;

    if (blockHeight != null && this.#minimum != null) {
      if (isBlockHeightAhead(this.#minimum, blockHeight) === true) {
        // return minimum block height if it's ahead of current, then use that
        // value
        return this.#minimum;
      }

      this.#minimum = undefined;
    }

    return blockHeight;
  }

  /**
   * returns pending block height, if any currently exists.
   */
  getPending(): RPCBlockHeight | undefined {
    this.#maybePromotePending();

    const blockHeight = this.#pending?.value;

    if (blockHeight != null && this.#minimum != null) {
      if (isBlockHeightAhead(blockHeight, this.#minimum) === false) {
        // if pending block height isn't ahead of minimum value, then hold it
        // back and return undefined - it doesn't make sense
        return undefined;
      }
    }

    return blockHeight;
  }

  /**
   * updates the currently known block height, applying an automatic expiration
   * timestamp to ensure that we do not retain block height for longer than we
   * can guarantee it to be fresh.
   */
  setCurrent(value: RPCBlockHeight, expiresAt: Date) {
    this.#current = {
      value,
      expiresAt,
    };

    // reset pending block height; when applying current we need to "forget"
    // about any currently known pending block height
    this.#pending = undefined;
    clearTimeout(this.#promotePendingTimeout);

    // trigger change handler with the newly applied value
    this.#onChangeHandler?.(value, expiresAt);
  }

  /**
   * applies a pending block height, which will automatically be promoted at a
   * given propagation timestamp.
   */
  setPending(value: RPCBlockHeight, propagatesAt: Date) {
    if (this.#clockManager.isPast(propagatesAt)) {
      // if the block height should already be propagated, then apply as current
      this.setCurrent(value, new Date(Date.now() + 3_000));
      return;
    }

    if (this.#pending) {
      // if a previously pending block height was known, then promote it
      // immediately
      this.promotePending(this.#pending.value);
    } else if (this.#current) {
      // ... otherwise extend the expiration of currently known block height
      // until the time of propagation of the new block height
      this.#current.expiresAt = propagatesAt;
    }

    this.#pending = {
      value,
      propagatesAt,
    };

    // trigger automatic promotion of the pending block height at the desired
    // timestamp
    clearTimeout(this.#promotePendingTimeout);
    this.#promotePendingTimeout = setTimeout(() => {
      this.promotePending(value);
    }, this.#clockManager.computeDelta(propagatesAt));
  }

  /**
   * promote pending block height in response to events received from sync
   * manager.
   */
  promotePending(blockHeight: RPCBlockHeight) {
    if (this.#pending?.value === blockHeight) {
      this.setCurrent(this.#pending.value, new Date(Date.now() + 3_000));
    }
  }

  /**
   * promote pending block height if it's propagation timestamp has been
   * exceeded.
   */
  #maybePromotePending() {
    if (!this.#pending || !this.#clockManager.isPast(this.#pending.propagatesAt)) {
      // bail out if it's not time to promote pending block height
      return;
    }

    this.setCurrent(this.#pending.value, new Date(Date.now() + 3_000));
  }

  /**
   * apply the minimum allowed block height
   */
  setMinimum(blockHeight: RPCBlockHeight) {
    if (this.#minimum != null) {
      if (isBlockHeightAhead(blockHeight, this.#minimum) === false) {
        // bail out if the new minimum value isn't ahead of the currently
        // applied one; ensuring that minimum will only ever be pushed forwards
        return;
      }
    }

    this.#minimum = blockHeight;
  }
}
