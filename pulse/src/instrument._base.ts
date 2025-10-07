import { LRUCache } from "@direct.dev/shared";

import type { ExemplarReservoirPolicy, BucketedExemplarReservoir } from "./instrument._exemplars.js";
import { makeExemplarReservoir } from "./instrument._exemplars.js";
import type {
  CounterDataPoint,
  MetricAttributesFromSchema,
  MetricAttributesSchema,
  MetricDataPoint,
  PulseSpan,
} from "./typings.js";
import type { AttributeCodec, SerializedMetricAttributes } from "./util.compile-attr-codec.js";
import { compileAttrCodec } from "./util.compile-attr-codec.js";
import { now } from "./util.now.js";

export type InstrumentOptions = {
  /**
   * The unit of values collected by this instrument.
   */
  unit: string;

  /**
   * Maximum number of attribute keys to allow per-export; if more values are
   * recorded, an LRU cache is applied to silently drop data and prevent
   * unbounded memory consumption.
   */
  capacity: number;

  /**
   * Configuration of exemplar recording policy, allowing per-metric overrides
   * of the applied policy.
   */
  exemplars: ExemplarReservoirPolicy;
};

export type InstrumentEntry<TData> = {
  /**
   * The recorded value of this metric.
   */
  value: TData;

  /**
   * Reservoir of sampled exemplars to associate with this metric, to allow
   * association between traces and metrics.
   */
  exemplars: BucketedExemplarReservoir;
};

/**
 * Abstract implementation of instruments for collecting metrics, providing
 * primitives to ease specific implementations such as Gauge, Histogram and
 * Counter.
 */

export abstract class PulseInstrument<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TAttrs extends MetricAttributesSchema = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TData = any,
  TValue extends number | bigint = number,
> {
  #options: InstrumentOptions;

  /**
   * The name of the instrument; injected into all flushed data points
   * collected by it.
   */
  readonly name: string;

  /**
   * The name of the unit which the instrument collects metrics in; injected
   * into all flushed data points.
   */
  readonly unit: string;

  /**
   * The type of data points collected by this
   */
  abstract readonly type: MetricDataPoint["type"];

  /**
   * Pre-compiled codec for attributes, which allows aggregation of data points
   * per-attribute set in a fast and robust manner.
   */
  #attrCodec: AttributeCodec<TAttrs>;

  /**
   * Cache of collected data points since last flushing
   */
  #dataReservoir: LRUCache<SerializedMetricAttributes, InstrumentEntry<TData>>;

  /**
   * Timestamp for the last flushing of metrics, used internally when metric
   * rates are calculated over time.
   */
  protected lastFlush = Date.now();

  /**
   * Number of data points dropped due to LRUCache overload since last flushing
   * of metrics; used to auto-propagate `${name}_dropped` metric.
   */
  #droppedDataPointCount = 0;

  constructor(
    name: string,
    options: Partial<InstrumentOptions> & { unit: string },
    attributeSchema: TAttrs = {} as TAttrs,
  ) {
    options.capacity ??= 50;
    options.exemplars ??= { strategy: "ring", capacity: 3 };

    if (options.capacity === 0 || options.capacity >>> 0 !== options.capacity) {
      throw new Error(`PulseInstrument(${name}): options.capacity must be a uint32 >= 1`);
    }

    if (
      options.exemplars.strategy === "ring" &&
      (options.exemplars.capacity === 0 || options.exemplars.capacity >>> 0 !== options.exemplars.capacity)
    ) {
      throw new Error(`PulseInstrument(${name}): options.exemplars.capacity must be a uint32 >= 1`);
    }

    this.name = name;
    this.unit = options.unit;

    this.#options = options as InstrumentOptions;
    this.#attrCodec = compileAttrCodec(name, attributeSchema);
    this.#dataReservoir = new LRUCache(options.capacity, () => {
      // count dropped data points when eviction happens
      this.#droppedDataPointCount++;
    });
  }

  /**
   * Record a new value into this instrument; signature allows for
   * per-instrument specification of desired inputs.
   */
  record(
    span: PulseSpan | undefined,
    attrs: MetricAttributesFromSchema<TAttrs>,
    value: TValue | null | undefined,
  ): void {
    if (value == null) {
      // ignore nullish values, there is nothing to collect
      return;
    }

    const attrKey = this.#attrCodec.serialize(attrs);
    const entry: InstrumentEntry<TData | undefined> = this.#dataReservoir.get(attrKey) ?? {
      exemplars: makeExemplarReservoir(this.#options.exemplars),
      value: undefined,
    };

    const bucketIndex = this.accumulateValue(entry, value);

    if (span?.traceSampled && bucketIndex !== null) {
      // if a trace was provided, then add exemplar for the recorded metrics
      entry.exemplars.add(bucketIndex, {
        timestamp: now(),
        span,
        value,
      });
    }

    if (entry.value !== undefined) {
      this.#dataReservoir.set(attrKey, entry as InstrumentEntry<TData>);
    }
  }

  /**
   * Internally accumulate values in the data reservoir, and return exemplar
   * configurations for tracing if relevant.
   */
  protected abstract accumulateValue(
    entry: InstrumentEntry<TData | undefined>,
    value: TValue,
  ): number | undefined | null;

  /**
   * Format and return all data points aggregated in-memory internally;
   * designed to be used through the public `flush` method.
   */
  protected abstract exportValue(value: TData): Omit<MetricDataPoint, "type" | "name" | "unit" | "attrs" | "exemplars">;

  /**
   * Flushes all aggregated data points, designed for usage within the core
   * `Pulse` instance to allow exporting of data.
   */
  flush(): {
    collected: MetricDataPoint[];
    dropped: CounterDataPoint | undefined;
  } {
    try {
      const size = this.#dataReservoir.size;
      const dropped: CounterDataPoint | undefined =
        this.#droppedDataPointCount > 0
          ? {
              type: "counter",
              name: `${this.name}_dropped`,
              unit: "1",
              value: this.#droppedDataPointCount,
              attrs: {},
              exemplars: [],
            }
          : undefined;

      if (size === 0) {
        return {
          collected: [],
          dropped,
        };
      }

      const collected = new Array<MetricDataPoint>(size);
      let i = 0;

      for (const [attrs, entry] of this.#dataReservoir.entries()) {
        collected[i++] = {
          type: this.type,
          name: this.name,
          unit: this.unit,
          attrs: this.#attrCodec.deserialize(attrs),
          exemplars: entry.exemplars.flush(),
          ...this.exportValue(entry.value),
        } as unknown as MetricDataPoint;
      }

      return { collected, dropped };
    } finally {
      // reset in-memory aggregation
      this.#dataReservoir.clear();
      this.lastFlush = Date.now();
      this.#droppedDataPointCount = 0;
    }
  }
}
