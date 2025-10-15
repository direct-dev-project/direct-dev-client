import { PulseCounter } from "./instrument.counter.js";
import { PulseHistogram } from "./instrument.histogram.js";

const PREFIX = "pulse.internal.";

/**
 * Helper to build meta-observability instruments for Pulse to monitor itself.
 */
export function makePulseMetaInstruments() {
  return {
    flushDurationMs: new PulseHistogram(PREFIX + "flush_duration_ms", {
      unit: "ms",
      bounds: [1, 2, 3, 5, 10, 15, 20, 25, 50, 100, 250, 500],
    }),

    metricsDecisionCount: new PulseCounter(PREFIX + "metrics_decision_count", { unit: "1" }, [
      "decision:included",
      "decision:dropped",
    ]),

    logDecisionCount: new PulseCounter(PREFIX + "log_decision_count", { unit: "1" }, [
      "decision:included",
      "decision:not_sampled",
      "decision:below_log_level",
    ]),
    traceDecisionCount: new PulseCounter(PREFIX + "trace_decision_count", { unit: "1" }, [
      "decision:included",
      "decision:not_sampled",
    ]),
  };
}

export type PulseMetaInstruments = ReturnType<typeof makePulseMetaInstruments>;
