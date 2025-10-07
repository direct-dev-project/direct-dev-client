import { Pulse } from "./_pulse.js";
import type { PulseInstrument } from "./instrument._base.js";
import type { CounterDataPoint, GaugeDataPoint, HistogramDataPoint, UpDownCounterDataPoint } from "./typings.js";

/**
 * Mock of Pulse which guarantess no telemetry export happens
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class MockPulse<TInstruments extends Record<string, PulseInstrument> = any> extends Pulse<TInstruments> {
  /**
   * Collection of CounterDataPoints exported when calling `.flush()`.
   */
  readonly counters = new Map<string, CounterDataPoint[]>();

  /**
   * Collection of UpDownCounterDataPoints exported when calling `.flush()`.
   */
  readonly upDownCounters = new Map<string, UpDownCounterDataPoint[]>();

  /**
   * Collection of GaugeDataPoints exported when calling `.flush()`.
   */
  readonly gauges = new Map<string, GaugeDataPoint[]>();

  /**
   * Collection of histogram metrics, updated when calling flush.
   */
  readonly histograms = new Map<string, HistogramDataPoint[]>();

  constructor(instruments: TInstruments) {
    super(
      {
        serviceNamespace: undefined,
        serviceName: "test",
        serviceInstanceId: undefined,
        serviceVersion: PACKAGE_VERSION,
        projectId: undefined,
        networkId: undefined,
        coloId: undefined,
        continentId: undefined,
      },
      {
        logLevel: "*:silent",
        logSamples: "*:0",
        traceSamples: "*:0",
        logWriter: noop,
        traceExporter: noop,

        // override metric exporter to aggregate datapoints in-memory to be
        // inspected upon testing
        metricExportIntervalMs: 0,
        metricPrefix: "",
        metricExporter: async (timestamp, origin, metrics) => {
          metrics.forEach((metric) => {
            switch (metric.type) {
              case "counter":
                this.counters.set(metric.name, [...(this.counters.get(metric.name) ?? []), ...metric.dataPoints]);
                break;

              case "up_down_counter":
                this.upDownCounters.set(metric.name, [
                  ...(this.upDownCounters.get(metric.name) ?? []),
                  ...metric.dataPoints,
                ]);
                break;

              case "gauge":
                this.gauges.set(metric.name, [...(this.gauges.get(metric.name) ?? []), ...metric.dataPoints]);
                break;

              case "histogram":
                this.histograms.set(metric.name, [...(this.histograms.get(metric.name) ?? []), ...metric.dataPoints]);
            }
          });
        },
      },
      instruments,
    );
  }

  /**
   * @override Deactivate support for automatic exporting
   */
  activateExport() {
    // noop
  }

  /**
   * @override Deactivate support for automatic exporting
   */
  async deactivateExport() {
    // noop
  }

  /**
   * @override Deactivate support for scheduled exporting
   */
  async scheduleExport() {
    // noop
  }

  /**
   * Flushes metrics by running exporting (which flushes immediately), and
   * returns aggregates collected by the exporter method.
   */
  async flush() {
    await this.flush();
  }
}

const noop = async () => {
  /* noop */
};
