import type { AnyInstrument } from "./_pulse.js";
import { Pulse } from "./_pulse.js";
import type { CounterDataPoint, GaugeDataPoint, HistogramDataPoint, UpDownCounterDataPoint } from "./typings.js";

/**
 * Mock of Pulse which guarantess no telemetry export happens
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class MockPulse<TInstruments extends Record<string, AnyInstrument> = any> extends Pulse<TInstruments> {
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

        // override metric exporter to aggregate datapoints in-memory to be
        // inspected upon testing
        metricExportIntervalMs: 0,

        exporter: () => ({
          log: noop,
          trace: noop,
          flush: noop,

          metrics: (metrics) => {
            metrics.forEach(({ name, metrics }) => {
              switch (metrics[0].type) {
                case "counter":
                  this.counters.set(name, [...(this.counters.get(name) ?? []), ...(metrics as CounterDataPoint[])]);
                  break;

                case "up_down_counter":
                  this.upDownCounters.set(name, [
                    ...(this.upDownCounters.get(name) ?? []),
                    ...(metrics as UpDownCounterDataPoint[]),
                  ]);
                  break;

                case "gauge":
                  this.gauges.set(name, [...(this.gauges.get(name) ?? []), ...(metrics as GaugeDataPoint[])]);
                  break;

                case "histogram":
                  this.histograms.set(name, [
                    ...(this.histograms.get(name) ?? []),
                    ...(metrics as HistogramDataPoint[]),
                  ]);
              }
            });
          },
        }),
      },
      instruments,
    );
  }

  /**
   * @override Deactivate support for automatic exporting
   */
  activateAutoExport() {
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
  async export() {
    await super.export();
  }
}

const noop = async () => {
  /* noop */
};
