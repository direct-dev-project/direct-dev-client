import type { MetricExemplar } from "./typings.js";

export type ExemplarReservoirPolicy =
  | { strategy: "ring"; capacity: number }
  | { strategy: "first-last-max" }
  | { strategy: "first-max" };

/**
 * Factory to instantiate exemplar based on policy configuration
 */
export function makeExemplarReservoir(policy: ExemplarReservoirPolicy): BucketedExemplarReservoir {
  switch (policy.strategy) {
    case "ring":
      return new RingReservoir(policy.capacity);

    case "first-max":
      return new FirstMaxReservoir();

    case "first-last-max":
      return new FirstLastMaxReservoir();
  }
}

/**
 * Exemplar reservoirs are used to collect sampled metric exemplars, linking
 * metrics to specific traces, without overloading memory by unbounded data
 * collection.
 */
export abstract class BucketedExemplarReservoir<TBucket = unknown> {
  /**
   * Collected exemplars, grouped by `bucketIndex` for a per-bucket collection
   * of data.
   */
  #reservoir = new Map<number | undefined, TBucket>();

  /**
   * Adds the exemplar to in-memory cache following the implemented collection
   * policy.
   */
  add(bucketIndex: number | undefined, exemplar: MetricExemplar): void {
    this.#reservoir.set(bucketIndex, this.updateBucket(this.#reservoir.get(bucketIndex), exemplar));
  }

  /**
   * Flushes all collected exemplar objects to an array, and clears internal
   * memory.
   */
  flush(): MetricExemplar[] {
    try {
      return Array.from(this.#reservoir.values()).flatMap((it) => this.exportBucket(it));
    } finally {
      this.#reservoir.clear();
    }
  }

  /**
   * Adds an exemplar to the cached entry, triggered by `add`.
   */
  protected abstract updateBucket(prev: TBucket | undefined, exemplar: MetricExemplar): TBucket;

  /**
   * Exports a collected exemplar entry to an array, triggered automatically by
   * `flush` on a per-bucket level.
   */
  protected abstract exportBucket(entry: TBucket): MetricExemplar[];
}

type RingBuffer = {
  buffer: MetricExemplar[];
  i: number;
};

/**
 * Reservoir implementing a ring buffer policy to handle O(1) writes and exports
 */
class RingReservoir extends BucketedExemplarReservoir<RingBuffer> {
  /**
   * Configuration of the maximum capacity of this reservoir, after which
   * points the ring buffer starts rolling collection.
   */
  #capacity: number;

  constructor(capacity: number) {
    super();
    this.#capacity = capacity;
  }

  protected updateBucket(entry: RingBuffer | undefined, exemplar: MetricExemplar): RingBuffer {
    entry ??= {
      buffer: [],
      i: 0,
    };

    if (entry.buffer.length < this.#capacity) {
      entry.buffer.push(exemplar);
    } else {
      entry.buffer[entry.i++ % this.#capacity] = exemplar;
    }

    return entry;
  }

  protected exportBucket(entry: RingBuffer): MetricExemplar[] {
    return entry.buffer;
  }
}

type FirstMaxBuffer = {
  first: MetricExemplar;
  max: MetricExemplar;
};

/**
 * Simple reservoir collecting the first observed exemplar as well as the
 * exemplar containing the highest value.
 */
class FirstMaxReservoir extends BucketedExemplarReservoir<FirstMaxBuffer> {
  protected updateBucket(prev: FirstMaxBuffer | undefined, exemplar: MetricExemplar): FirstMaxBuffer {
    prev ??= {
      first: exemplar,
      max: exemplar,
    };

    if (exemplar.value > prev.max.value) {
      prev.max = exemplar;
    }

    return prev;
  }

  protected exportBucket(entry: FirstMaxBuffer) {
    return [entry.first, entry.max];
  }
}

type FirstLastMaxBuffer = {
  first: MetricExemplar;
  last: MetricExemplar;
  max: MetricExemplar;
};

/**
 * Simple reservoir collecting the first and last observed exemplar as well as
 * the exemplar containing the highest value.
 */
class FirstLastMaxReservoir extends BucketedExemplarReservoir<FirstLastMaxBuffer> {
  protected updateBucket(prev: FirstLastMaxBuffer | undefined, exemplar: MetricExemplar): FirstLastMaxBuffer {
    prev ??= {
      first: exemplar,
      last: exemplar,
      max: exemplar,
    };

    prev.last = exemplar;

    if (exemplar.value > prev.max.value) {
      prev.max = exemplar;
    }

    return prev;
  }

  protected exportBucket(entry: FirstLastMaxBuffer) {
    return [entry.first, entry.last, entry.max];
  }
}
