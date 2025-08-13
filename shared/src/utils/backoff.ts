type Config = {
  /**
   * cooldown period after backoff has ended, during which failure count is
   * retained to ensure that backoff duration is increased in case of
   * subsequent failures.
   */
  cooldownMs: number;

  /**
   * base for exponential backoffs, applied at increments of 1x, 2x, 4x, 8x,
   * 16x, 32x, 64x, 128x, 256x.
   */
  baseDurationMs: number;
};

/**
 * utility to manage exponential backoff with a clean external interface
 */
export class DirectBackoffManager {
  #config: Config;

  /**
   * current failure count observed, used to calculate the exponential backoff
   * duration.
   */
  #failureCount = new Map<string, number>();

  /**
   * timestamp at which current back-off period ends.
   */
  #endsAt = new Map<string, number>();

  /**
   * callback to be triggered every time a backoff event occurs, allowing
   * seamless telemetry ingestion.
   */
  #onEvent: (evt: Omit<BackoffEvent, "source">) => void;

  constructor(config: Config, onEvent?: (evt: Omit<BackoffEvent, "source">) => void) {
    this.#config = config;
    this.#onEvent =
      onEvent ??
      (() => {
        /* noop */
      });
  }

  /**
   * handle a failure, updating internal state and determining backoff period
   *
   * @return the number of milliseconds to wait before resuming operations.
   */
  handleFailure(contextId: string): number {
    this.#maybeResetFailureCount(contextId);

    const prevFailureCount = this.#failureCount.get(contextId) ?? 0;
    const backOffMs = 2 ** Math.min(8, prevFailureCount) * this.#config.baseDurationMs;
    const backoffEndsAt = new Date(Date.now() + backOffMs);

    this.#failureCount.set(contextId, prevFailureCount + 1);
    this.#endsAt.set(contextId, backoffEndsAt.getTime());

    this.#onEvent({
      contextId,
      failureCount: prevFailureCount + 1,
      registerredAt: new Date(),
      durationMs: backOffMs,
    });

    return backOffMs;
  }

  /**
   * forcibly reset failure count, if external heuristics have determined that
   * exponential backoff should be disabled.
   */
  resetStatus(contextId: string) {
    this.#failureCount.delete(contextId);
    this.#endsAt.delete(contextId);
  }

  /**
   * check if backoff should currently be applied.
   *
   * @param contextId - the ID to check backoff status for, if an input pattern
   *                    that ends in "/*" is given, then it acts like a wildcard
   *                    checking back-off status for all contexts starting with
   *                    that value
   */
  shouldBackOff(contextId: string): boolean {
    if (!contextId.endsWith("/*")) {
      const endsAt = this.#endsAt.get(contextId);
      return !!endsAt && endsAt > Date.now();
    } else {
      const matchedContextId = contextId.slice(0, contextId.length - 2);

      const endsAt = Array.from(this.#endsAt).reduce((acc, [contextId, endsAt]) => {
        if (contextId.startsWith(matchedContextId)) {
          return Math.max(endsAt, acc);
        }

        return acc;
      }, 0);

      return !!endsAt && endsAt > Date.now();
    }
  }

  /**
   * reset previous failure count, if there hasn't been any failures observed
   * for the defined threshold.
   */
  #maybeResetFailureCount(contextId: string) {
    const endsAt = this.#endsAt.get(contextId);

    if (endsAt && endsAt < Date.now() - this.#config.cooldownMs) {
      this.#failureCount.set(contextId, 0);
    }
  }
}
