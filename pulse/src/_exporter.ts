import type {
  PulseSpan,
  PulseContext,
  LogFields,
  TraceEvent,
  LogLevel,
  CounterDataPoint,
  UpDownCounterDataPoint,
  GaugeDataPoint,
  HistogramDataPoint,
} from "./typings.js";

/**
 * Exporters are responsible for actually emitting telemetry collected through
 * Pulse, abstracting ingestion from integrations.
 */
export abstract class PulseExporter {
  /**
   * Export traces to the telemetry backend.
   */
  abstract trace(
    span: PulseSpan,
    context: PulseContext,
    attributes: LogFields | undefined,
    events: TraceEvent[] | undefined,
    result: {
      startTimestamp: number;
      endTimestamp: number;
      success: boolean;
      message: string | undefined;
    },
  ): void;

  /**
   * Export logs to the telemetry backend.
   */
  abstract log(
    level: Exclude<LogLevel, "silent">,
    timestamp: number,
    message: string,
    span: PulseSpan | undefined,
    context: PulseContext | undefined,
    fields?: LogFields,
  ): void;

  /**
   * Export metrics to the telemetry backend.
   */
  abstract metrics(
    metrics: Array<{
      timestamp: number;
      name: string;
      unit: string;
      metrics:
        | [CounterDataPoint, ...CounterDataPoint[]]
        | [UpDownCounterDataPoint, ...UpDownCounterDataPoint[]]
        | [GaugeDataPoint, ...HistogramDataPoint[]]
        | [HistogramDataPoint, ...HistogramDataPoint[]];
    }>,
  ): void;

  /**
   * Flushes all currently collected metrics to the telemetry backend.
   */
  abstract flush(): Promise<void>;
}
