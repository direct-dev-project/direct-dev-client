import type { InstrumentEntry, InstrumentOptions } from "./instrument._base.js";
import { PulseInstrument } from "./instrument._base.js";
import type { MetricAttributesSchema, HistogramDataPoint } from "./typings.js";

type DataPoint = {
  counts: [number, number, ...number[]];
  sum: number;
};

/**
 * Basic histogram instrument, which aggregates recorded values in-memory and
 * exports number of matches within each defined bucket within the export
 * interval.
 */

export class PulseHistogram<
  const TLabels extends string[] | null = null,
  const TAttrs extends MetricAttributesSchema | null = null,
> extends PulseInstrument<TLabels, TAttrs, DataPoint, number> {
  readonly type = "histogram";

  /**
   * configuration of bucket bounds, as provided when instantiating the
   * instrument - used when grouping recorded values into buckets.
   */
  #bounds: [number, ...number[]];

  constructor(
    name: string,
    options: Partial<InstrumentOptions> & {
      unit: string;
      bounds: [number, ...number[]];
    },
    labels: TLabels = null as TLabels,
    attributeSchema: TAttrs = null as TAttrs,
  ) {
    super(name, options, labels, attributeSchema);

    // validate bounds: strictly increasing & finite
    if (!Number.isFinite(options.bounds[0]) || options.bounds[0] < 0) {
      throw new Error(`PulseHistogram(${name}): first bound must be finite and >= 0`);
    }

    for (let i = 1; i < options.bounds.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (!Number.isFinite(options.bounds[i]) || options.bounds[i]! <= options.bounds[i - 1]!) {
        throw new Error(`PulseHistogram(): bounds must be finite and strictly increasing`);
      }
    }

    this.#bounds = Object.freeze([...options.bounds]) as [number, ...number[]];
  }

  protected accumulateValue(entry: InstrumentEntry<DataPoint | undefined>, value: number) {
    if (!Number.isFinite(value) || value < 0) {
      // silently ignore non-finite metrics
      return null;
    }

    const bucketIndex = this.#computeBucketIndex(value);

    // ensure that data buffer exists
    entry.value ??= {
      counts: Array.from({ length: this.#bounds.length + 1 }, () => 0) as [number, number, ...number[]],
      sum: 0,
    };

    entry.value.sum += value;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    entry.value.counts[bucketIndex]!++;

    return bucketIndex;
  }

  protected exportValue(value: DataPoint): Omit<HistogramDataPoint, "type" | "name" | "unit" | "attrs" | "exemplars"> {
    return {
      bounds: this.#bounds,
      counts: value.counts,
      sum: value.sum,
    };
  }

  /**
   * Binary search for the first bucket index whose upper bound is >= value
   * (upper‑inclusive).
   */
  #computeBucketIndex(value: number): number {
    const bounds = this.#bounds;
    let low = 0;
    let high = bounds.length - 1;
    let bucketIndex = bounds.length;

    while (low <= high) {
      // binary identification of Math.floor((low + high) / 2) for fastest
      // runtime perf
      const mid = (low + high) >>> 1;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (value <= bounds[mid]!) {
        // if value is included within bound, then move bucketIndex here and
        // continue searching for a smaller bound that might match
        bucketIndex = mid;
        high = mid - 1;
      } else {
        // ... if value is higher than this bound, then increase limit and
        // keep scanning for higher bounds that match the given value
        low = mid + 1;
      }
    }

    return bucketIndex; // in [0..bounds.length]
  }
}
