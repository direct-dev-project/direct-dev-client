import type { InstrumentEntry } from "./instrument._base.js";
import { PulseInstrument } from "./instrument._base.js";
import type { GaugeDataPoint, MetricAttributesSchema } from "./typings.js";

/**
 * Basic gauge instrument, flushing the _last_ recorded value at every export
 * interval.
 */

export class PulseGauge<
  const TLabels extends string[] | null = null,
  const TAttrs extends MetricAttributesSchema | null = null,
> extends PulseInstrument<TLabels, TAttrs, number, number | bigint> {
  readonly type = "gauge";

  protected accumulateValue(entry: InstrumentEntry<number | bigint | undefined>, value: number | bigint) {
    if (typeof value !== "bigint" && !Number.isFinite(value)) {
      // silently ignore non-finite metrics
      return null;
    }

    entry.value = value;

    // counters don't bucket values, always apply undefined to exemplar
    // bucketIndex
    return undefined;
  }

  protected exportValue(
    value: number | bigint,
  ): Omit<GaugeDataPoint, "type" | "name" | "unit" | "attrs" | "exemplars"> {
    return {
      value,
    };
  }
}

type AvgData = {
  sum: number;
  count: number;
};

/**
 * Basic gauge instrument, flushing the _average_ recorded value at every export
 * interval.
 */

export class PulseAvgGauge<
  const TLabels extends string[] | null = null,
  const TAttrs extends MetricAttributesSchema | null = null,
> extends PulseInstrument<TLabels, TAttrs, AvgData, number> {
  readonly type = "gauge";

  protected accumulateValue(entry: InstrumentEntry<AvgData | undefined>, value: number) {
    if (!Number.isFinite(value)) {
      // silently ignore non-finite metrics
      return null;
    }

    entry.value ??= { sum: 0, count: 0 };
    entry.value.sum += value;
    entry.value.count++;

    // counters don't bucket values, always apply undefined to exemplar
    // bucketIndex
    return undefined;
  }

  protected exportValue(value: AvgData): Omit<GaugeDataPoint, "type" | "name" | "unit" | "attrs" | "exemplars"> {
    return {
      value: value.sum / value.count,
    };
  }
}
