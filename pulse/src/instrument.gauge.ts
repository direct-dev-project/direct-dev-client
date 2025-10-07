import type { InstrumentEntry } from "./instrument._base.js";
import { PulseInstrument } from "./instrument._base.js";
import type { GaugeDataPoint, MetricAttributesSchema } from "./typings.js";

/**
 * Basic gauge instrument, flushing the _last_ recorded value at every export
 * interval.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class PulseGauge<const TAttrs extends MetricAttributesSchema = {}> extends PulseInstrument<
  TAttrs,
  number,
  number | bigint
> {
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
