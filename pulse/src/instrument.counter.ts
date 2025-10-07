import type { InstrumentEntry } from "./instrument._base.js";
import { PulseInstrument } from "./instrument._base.js";
import type { MetricAttributesSchema, CounterDataPoint, UpDownCounterDataPoint } from "./typings.js";

/**
 * Basic counter instrument, which aggregates all increments in-memory until
 * they're flushed within the export interval.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class PulseCounter<const TAttrs extends MetricAttributesSchema = {}> extends PulseInstrument<
  TAttrs,
  number,
  number | bigint
> {
  readonly type = "counter";

  protected accumulateValue(entry: InstrumentEntry<number | undefined>, value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      // silently ignore non-finite, non-positive metrics
      return null;
    }

    entry.value = (entry.value ?? 0) + value;

    // counters don't bucket values, always apply undefined to exemplar
    // bucketIndex
    return undefined;
  }

  protected exportValue(value: number): Omit<CounterDataPoint, "type" | "name" | "unit" | "attrs" | "exemplars"> {
    return {
      value,
    };
  }
}

/**
 * UpDownCounter instrument which allows both incrementing and decrementing
 * values.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class PulseUpDownCounter<const TAttrs extends MetricAttributesSchema = {}> extends PulseInstrument<
  TAttrs,
  number,
  number | bigint
> {
  readonly type = "up_down_counter";

  protected accumulateValue(entry: InstrumentEntry<number | undefined>, value: number) {
    if (!Number.isFinite(value)) {
      // silently ignore non-finite values
      return null;
    }

    entry.value = (entry.value ?? 0) + value;

    // counters don't bucket values, always apply undefined to exemplar
    // bucketIndex
    return undefined;
  }

  protected exportValue(value: number): Omit<UpDownCounterDataPoint, "type" | "name" | "unit" | "attrs" | "exemplars"> {
    return {
      value,
    };
  }
}
