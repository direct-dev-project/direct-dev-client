import { asyncTimeout } from "@direct.dev/shared";

import { LOG_LEVEL_RANK } from "./constants.js";
import { type PulseInstrument } from "./instrument._base.js";
import type {
  LogFields,
  PulseContext,
  PulseOrigin,
  LogWriter,
  LogLevel,
  TraceExporter,
  MetricExporter,
  InstrumentRecordArgInference,
  MetricDataPointGroup,
  TraceEvent,
  PulseSpan,
  PulseSpanKind,
} from "./typings.js";
import { generateSpanId, generateTraceId } from "./util.generate-ids.js";
import { now } from "./util.now.js";
import type { ParsedLogLevel } from "./util.parse-log-level.js";
import { parseLogLevel } from "./util.parse-log-level.js";
import type { ParsedLogSampling } from "./util.parse-log-sampling.js";
import { parseLogSampling } from "./util.parse-log-sampling.js";
import { parseTraceSampling, type ParsedTraceSampling } from "./util.parse-trace-sampling.js";
import { stringifyAttribute } from "./util.stringify-attribute.js";

type PulseOptions = {
  /**
   * Log level pattern, allowing fine-grained tuning of log levels on a
   * per-origin and per-flow basis.
   *
   * @example
   * ```text
   * *:warn origin:rpc.revalidator:verbose flow:rpc-sync:verbose
   * ```
   *
   * @note The lowest matching level will be applied when performing logging.
   */
  logLevel: string;

  /**
   * Log sampling pattern, allowing fine-grained tuning of log sampling on a
   * per-origin, per-flow and per-level basis.
   *
   * @example *:0 level:error:1 level:warn:0.2 level:info:0.01 origin:rpc.revalidator:1 flow:rpc-sync:1
   *
   * @note The highest value will be applied when performing sampling.
   */
  logSamples: string;

  /**
   * Writes logs (e.g. to console or uploads to external service for collection)
   */
  logWriter: LogWriter;

  /**
   * Optionally apply a redactor function to ensure that log fields to not carry
   * unwanted data. By default no redaction is applied.
   */
  logRedactor?: (fields: LogFields) => LogFields;

  /**
   * Prefix to apply to metric names created through this Pulse instance.
   *
   * @default `${origin.serviceId}.${origin.moduleId}`
   */
  metricPrefix?: string;

  /**
   * Specifies the interval in which metrics are exported to source, controlling
   * how many metrics will be batched.
   *
   * @default 15_000
   */
  metricExportIntervalMs?: number;

  /**
   * Exports collected metrics in a fixed interval
   */
  metricExporter: MetricExporter;

  /**
   * Trace sampling pattern, allowing fine-grained tuning of trace sampling on a
   * per-origin and per-flow basis.
   *
   * @example *:0.02 origin:rpc.revalidator:1 event:revalidate:1
   *
   * @note The highest value will be applied when performing sampling.
   */
  traceSamples: string;

  /**
   * Exports generated traces, allowing logs and metrics to be traced across
   * origins.
   */
  traceExporter: TraceExporter;
};

type ParsedPulseOptions = {
  logLevel: ParsedLogLevel;
  logSampling: ParsedLogSampling;
  traceSampling: ParsedTraceSampling;
};
type PulseLoggers = Record<
  Exclude<LogLevel, "silent">,
  (message: string, fields: LogFields | (() => LogFields), options?: { throttleMs: number }) => void
>;
export type PulseRecorders<TInstruments extends Record<string, PulseInstrument>> = {
  [K in keyof TInstruments]: (
    ...args: Parameters<TInstruments[K]["record"]> extends InstrumentRecordArgInference<infer U> ? U : []
  ) => void;
};

/**
 * Core API for collecting telemetry through Pulse.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class PulseAPI<TInstruments extends Record<string, PulseInstrument> = any> {
  protected origin: PulseOrigin;
  protected options: Required<PulseOptions>;
  protected parsedOptions: ParsedPulseOptions;
  protected instruments: Array<[string, PulseInstrument]>;

  protected currSpan: PulseSpan | undefined;
  protected currContext: PulseContext | undefined;

  readonly log: PulseLoggers;
  readonly record: PulseRecorders<TInstruments>;

  /**
   * When running in a traced context, these methods can be used to provide
   * additional details when exporting trace data.
   */
  trace?: {
    /**
     * Mark the trace as failed, regardless of outcome of the callback (allows
     * raising errors in telemetry even if no runtime exceptions are thrown).
     */
    setError: (errorCode: string, message: string) => void;

    /**
     * Add attributes to the exported trace, to allow finegrained details to be
     * added at runtime.
     */
    setAttributes: (attributes: LogFields) => void;

    /**
     * Add events to the trace, which are included when the trace is exported
     * to telemetry backend.
     */
    addEvent: (eventName: string, attributes?: LogFields) => void;

    /**
     * Add a background promise, which will be awaited prior to closing the
     * trace (useful to track complete response performance, when returning a
     * readable stream which doesn't close until later)
     */
    waitUntil: (promise: Promise<void>) => void;
  };

  constructor(
    origin: PulseOrigin,
    options: PulseOptions,
    parsedOptions: ParsedPulseOptions,
    instruments: Array<[string, PulseInstrument]>,
    context: PulseContext | undefined,
    span: PulseSpan | undefined,
    traceApi: PulseAPI["trace"],
  ) {
    this.parsedOptions = parsedOptions;
    this.currSpan = span;
    this.currContext = context;
    this.trace = traceApi;

    this.instruments = instruments;
    this.origin = origin;
    this.options = {
      ...options,
      logRedactor: options.logRedactor ?? ((fields) => fields),
      metricPrefix: options.metricPrefix ?? this.origin.originPath + ".",
      metricExportIntervalMs: options.metricExportIntervalMs ?? 15_000,
    };

    this.log = this.#makeLogger();
    this.record = this.#makeRecorder();
  }

  /**
   * Create a trace span, which instantiates a new PulseAPI automatically
   * associating all emitted telemetry to this trace.
   */
  async runSpan<T>(
    trace: {
      parent?: Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | Headers;
      parentRelationship?: "parent" | "link";
      kind: PulseSpanKind;
    },
    context: PulseContext,
    cb: (t: PulseAPI<TInstruments>) => Promise<T> | T,
  ): Promise<T> {
    const startTimestamp = now();

    //
    // STEP: generate trace context based on input
    //

    const traceParent = (() => {
      const explicitParent =
        trace.parent && trace.parent instanceof Headers ? this.fromRequestHeaders(trace.parent) : trace.parent;

      return explicitParent ?? this.exportTraceParent();
    })();

    const span = ((): PulseSpan => {
      //
      // NO PARENT: create a new root span and perform sampling
      //
      if (traceParent?.parentSpanId == null) {
        return {
          traceId: generateTraceId(),
          traceName: context.event,
          traceSampled: (() => {
            const samplingFactor =
              this.parsedOptions.traceSampling.byEvent[context.event] ?? this.parsedOptions.traceSampling.default;

            if (samplingFactor === 0) {
              return false;
            }

            if (samplingFactor === 1) {
              return true;
            }

            return Math.random() < samplingFactor;
          })(),
          parentSpanId: undefined,
          parentLink: undefined,
          spanId: generateSpanId(),
          spanKind: trace.kind,
        };
      }

      //
      // DIRECT PARENT: create a child span, but retain trace sampling and
      // configurations
      //
      const samplingFactor = this.parsedOptions.traceSampling.byEvent[context.event];

      if (trace.parentRelationship !== "link") {
        return {
          ...traceParent,
          traceSampled:
            samplingFactor == null
              ? traceParent.traceSampled
              : (() => {
                  if (samplingFactor === 0) {
                    return false;
                  }

                  if (samplingFactor === 1) {
                    return true;
                  }

                  return Math.random() < samplingFactor;
                })(),
          parentLink: undefined,
          spanId: generateSpanId(),
          spanKind: trace.kind,
        };
      }

      //
      // LINKED PARENT: create a new root span with automatic re-sampling, and
      // link to parent span
      //
      return {
        traceId: generateTraceId(),
        traceName: traceParent.traceName,
        traceSampled:
          samplingFactor == null
            ? traceParent.traceSampled
            : (() => {
                if (samplingFactor === 0) {
                  return false;
                }

                if (samplingFactor === 1) {
                  return true;
                }

                return Math.random() < samplingFactor;
              })(),
        parentSpanId: undefined,
        parentLink: {
          traceId: traceParent.traceId,
          traceName: traceParent.traceName,
          spanId: traceParent.parentSpanId,
        },
        spanId: generateSpanId(),
        spanKind: trace.kind,
      };
    })();

    //
    // STEP: perform callback and collect traces
    //
    const state = {
      didFail: false,
      error: undefined as { errorCode: string; message: string } | undefined,
      attributes: {} as LogFields,
      events: [] as TraceEvent[],
    };

    const backgroundPromises: Array<Promise<void>> = [];

    const t = new PulseAPI(
      this.origin,
      this.options,
      this.parsedOptions,
      this.instruments,
      { ...this.currContext, ...context },
      span,
      {
        setError: (errorCode, message) => {
          state.error = { errorCode, message };
        },
        setAttributes: (attributes) => {
          Object.assign(state.attributes, attributes);
        },
        addEvent: (eventName, attributes) => {
          state.events.push({
            timeStamp: now(),
            name: eventName,
            attributes,
          });
        },
        waitUntil: (promise) => {
          backgroundPromises.push(promise);
        },
      },
    );

    try {
      try {
        return await cb(t);
      } finally {
        await Promise.allSettled(backgroundPromises);
      }
    } catch (err) {
      state.didFail = true;

      if (state.error == null) {
        // if an error wasn't manually raised for the trace, then fail the
        // trace based on this error message
        this.options.traceExporter(
          this.origin,
          span.traceSampled
            ? span
            : {
                traceId: generateTraceId(),
                traceName: span.traceName,
                traceSampled: true,
                parentSpanId: undefined,
                parentLink: span.parentSpanId
                  ? {
                      traceId: span.traceId,
                      traceName: span.traceName,
                      spanId: span.parentSpanId,
                    }
                  : undefined,
                spanId: span.spanId,
                spanKind: span.spanKind,
              },
          context,
          {
            ...state.attributes,
            error_code: "UNCAUGHT",
          },
          state.events,
          {
            startTimestamp,
            endTimestamp: now(),
            success: false,
            message: stringifyAttribute(err),
          },
        );
      } else {
        // ... otherwise log the error, so it doesn't silently disappear
        t.log.error("An uncaught exception was thrown", { err });
      }

      throw err;
    } finally {
      if (state.error != null) {
        // if an error was raised manually, then fail the trace with that
        // specific error message
        this.options.traceExporter(
          this.origin,
          span.traceSampled
            ? span
            : {
                traceId: generateTraceId(),
                traceName: span.traceName,
                traceSampled: true,
                parentSpanId: undefined,
                parentLink: span.parentSpanId
                  ? {
                      traceId: span.traceId,
                      traceName: span.traceName,
                      spanId: span.parentSpanId,
                    }
                  : undefined,
                spanId: span.spanId,
                spanKind: span.spanKind,
              },
          context,
          {
            ...state.attributes,
            error_code: state.error.errorCode,
          },
          state.events,
          {
            startTimestamp,
            endTimestamp: now(),
            success: false,
            message: state.error.message,
          },
        );
      } else if (!state.didFail && span.traceSampled) {
        // if the span completed successfully, then determine whether we should
        // export the trace based on sampling configurations
        this.options.traceExporter(this.origin, span, context, state.attributes, state.events, {
          startTimestamp,
          endTimestamp: now(),
          success: true,
          message: undefined,
        });
      }
    }
  }

  /**
   * Create a contextualized PulseAPI, which automatically associates all
   * emitted telemetry with the given context without creating a trace.
   */
  async runInContext<T>(context: PulseContext, cb: (t: PulseAPI<TInstruments>) => Promise<T> | T): Promise<T> {
    const t = new PulseAPI(
      this.origin,
      this.options,
      this.parsedOptions,
      this.instruments,
      { ...this.currContext, ...context },
      this.currSpan,
      this.trace,
    );

    try {
      return await cb(t);
    } catch (err) {
      t.log.error("runInContext intercepted exception", { err });

      throw err;
    }
  }

  /**
   * Utility to create a child of this PulseAPI pre-bound to the provided
   * context variables.
   */
  with(context: LogFields): PulseAPI<TInstruments> {
    return new PulseAPI(
      this.origin,
      this.options,
      this.parsedOptions,
      this.instruments,
      { ...this.currContext, ...context } as PulseContext,
      this.currSpan,
      this.trace,
    );
  }

  /**
   * extract PulseTrace from provided request headers
   */
  fromRequestHeaders(headers: Headers): Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | undefined {
    //
    // STEP: extract trace headers from request
    //
    const traceParent = TRACEPARENT_HEADER_REGEX.exec(String(headers.get("traceparent") ?? ""));
    const traceName = headers.get("x-direct-tracename");

    if (!traceParent || !traceName || typeof traceName !== "string") {
      // if we're unable to extract trace from headers, then run without
      // any actual relationship
      return undefined;
    }

    //
    // STEP: run traced span if required input headers were provided
    //
    const [, , traceId, parentSpanId, flagsHex] = traceParent as unknown as [string, string, string, string, string];

    return {
      traceId,
      traceName,
      parentSpanId,
      traceSampled: (parseInt(flagsHex, 16) & 0x01) === 0x01,
    };
  }

  /**
   * Exports current trace span as Request Headers object suitable for usage
   * with `fetch()` requests.
   */
  toRequestHeaders() {
    if (!this.currSpan) {
      return undefined;
    }

    return {
      traceparent: `00-${this.currSpan.traceId}-${this.currSpan.spanId}-${this.currSpan.traceSampled ? "01" : "00"}`,
      "x-direct-tracename": this.currSpan.traceName,
    };
  }

  /**
   * Exports current span to be used as parent for subsequent spans during
   * tracing.
   */
  exportTraceParent(): Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | undefined {
    if (!this.currSpan) {
      return undefined;
    }

    return {
      traceId: this.currSpan.traceId,
      traceName: this.currSpan.traceName,
      traceSampled: this.currSpan.traceSampled,
      parentSpanId: this.currSpan.spanId,
    };
  }

  /**
   * Internal helper to build a log collector object.
   */
  #makeLogger(): Record<Exclude<LogLevel, "silent">, (message: string, fields: LogFields | (() => LogFields)) => void> {
    // hoist variables from context
    const { logWriter, logRedactor } = this.options;
    const origin = this.origin;

    // tiny utility to build logWriters per-level with sampling and redaction
    // built in
    const wrapLogWriter = (
      level: Exclude<LogLevel, "silent">,
    ): ((message: string, fields: LogFields | (() => LogFields)) => void) => {
      // read configurations
      const minLevel = this.currSpan
        ? (this.parsedOptions.logLevel.byTrace[this.currSpan.traceName] ?? this.parsedOptions.logLevel.default)
        : this.parsedOptions.logLevel.default;
      const samplingFactor = this.currSpan
        ? (this.parsedOptions.logSampling[level].byTrace[this.currSpan.traceName] ??
          this.parsedOptions.logSampling[level].default)
        : this.parsedOptions.logSampling[level].default;

      // fast path: silently drop fully ignored statements (no sampling or
      // level too low)
      const forceSample = !!this.currSpan && this.currSpan.traceSampled; // all logs forced if trace is sampled
      const alwaysSample = samplingFactor === 1 || forceSample;
      const neverSample = samplingFactor === 0 && !forceSample;

      if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[minLevel] || neverSample) {
        return noop;
      }

      // fast path: if sampling should always happen, then return callback
      // without sampling branch
      if (alwaysSample) {
        return (message, _fields) => {
          logWriter(
            level,
            now(),
            message,
            origin,
            this.currSpan,
            this.currContext,
            logRedactor(typeof _fields === "function" ? _fields() : _fields),
          );
        };
      }

      // otherwise create a callback that performs sampling at runtime
      return (message, _fields) => {
        if (Math.random() >= samplingFactor) {
          // silently drop if not sampled
          return;
        }

        logWriter(
          level,
          now(),
          message,
          origin,
          this.currSpan,
          this.currContext,
          logRedactor(typeof _fields === "function" ? _fields() : _fields),
        );
      };
    };

    return {
      verbose: wrapLogWriter("verbose"),
      debug: wrapLogWriter("debug"),
      info: wrapLogWriter("info"),
      warn: wrapLogWriter("warn"),
      error: wrapLogWriter("error"),
      fatal: wrapLogWriter("fatal"),
    };
  }

  /**
   * Internal utility used to build metric recorder callbacks under the hood.
   */
  #makeRecorder() {
    return Object.fromEntries(
      this.instruments.map(([key, instrument]) => [key, instrument.record.bind(instrument, this.currSpan)]),
    ) as unknown as PulseRecorders<TInstruments>;
  }
}

/**
 * Pulse enables hierarchical and structured emission of telemetry, with
 * built-in sampling, distributed tracing and support for exporters based on
 * current runtime environment.
 *
 * Pulse is fully compatible with both Edge and Browser runtimes
 */
export class Pulse<TInstruments extends Record<string, PulseInstrument>> extends PulseAPI<TInstruments> {
  /**
   * If automatic exporting of metrics is enabled, then this property contains
   * a reference to the bound interval.
   */
  #exportIntervalId: NodeJS.Timeout | number | undefined;

  /**
   * Specifies if manual exporting is currently scheduled, preventing multiple
   * schedules at once.
   */
  #exportScheduled = false;

  /**
   * Specifies if metrics are currently being flushed, used to prevent multiple
   * flushes happening concurrently.
   */
  #isFlushing = false;

  constructor(_origin: Omit<PulseOrigin, "originPath">, options: PulseOptions, instruments: TInstruments) {
    const originPath = [_origin.serviceNamespace, _origin.serviceName].filter(Boolean).join(".");
    const origin = { ..._origin, originPath };

    super(
      origin,
      options,
      {
        logLevel: parseLogLevel(options.logLevel, originPath),
        logSampling: parseLogSampling(options.logSamples, originPath),
        traceSampling: parseTraceSampling(options.traceSamples, originPath),
      },
      Object.entries(instruments),
      undefined,
      undefined,
      undefined,
    );
  }

  /**
   * Schedules a one-shot export after `metricExportIntervalMs`.
   *
   * If an interval export is active, this throws.
   * If a one-shot is already scheduled, returns undefined.
   *
   * Designed to be used for manually controlled exports of metrics.
   */
  async scheduleExport(): Promise<void> {
    if (this.#exportIntervalId != null) {
      throw new Error("Pulse.scheduleExport(): not allowed while activateExport() is managing automatic flushing.");
    }

    if (this.#exportScheduled) {
      return;
    }

    try {
      this.#exportScheduled = true;

      await asyncTimeout(this.options.metricExportIntervalMs);
      await this.flush();
    } finally {
      this.#exportScheduled = false;
    }
  }

  /**
   * Activate automatic exporting of metrics in the defined interval. Designed
   * to be used in response to "activation" lifecycle hooks.
   */
  activateExport(): void {
    if (this.#exportScheduled) {
      throw new Error("Pulse.activateExport(): not allowed when manual call to scheduleExport() is pending");
    }

    if (this.#exportIntervalId != null) {
      // silently stop if exporting is already activated
      return;
    }

    this.#exportIntervalId = setInterval(() => {
      this.flush();
    }, this.options.metricExportIntervalMs);
  }

  /**
   * Stop automatic exporting of metrics, ensuring that any metrics collected
   * during the latest window are immediately flushed.
   *
   * Designed to be used in response to "deactivation" lifecycle hooks.
   */
  async deactivateExport(): Promise<void> {
    if (this.#exportIntervalId == null) {
      // if automatic exporting isn't currently running, then do nothing
      return;
    }

    clearInterval(this.#exportIntervalId);
    this.#exportIntervalId = undefined;

    // auto-flush any metrics collected during the active window
    await this.flush();
  }

  /**
   * Internally performs flushing of metrics to the configured exporter,
   * preventing overlapping flushes.
   */
  async flush(): Promise<void> {
    if (this.#isFlushing) {
      return;
    }

    this.#isFlushing = true;

    try {
      const timestamp = now();
      const metrics: MetricDataPointGroup[] = [];

      for (const [, instrument] of this.instruments) {
        const { collected, dropped } = instrument.flush();

        if (collected.length > 0) {
          metrics.push({
            type: instrument.type,
            name: this.options.metricPrefix + instrument.name,
            unit: instrument.unit,
            dataPoints: collected,
          } as MetricDataPointGroup);
        }

        if (dropped) {
          metrics.push({
            type: dropped.type,
            name: this.options.metricPrefix + dropped.name,
            unit: dropped.unit,
            dataPoints: [dropped],
          });
        }
      }

      if (metrics.length > 0) {
        await this.options.metricExporter(timestamp, this.origin, metrics);
      }
    } catch (err) {
      this.log.warn("Pulse.flush failed", { err });
    } finally {
      this.#isFlushing = false;
    }
  }
}

export type { PulseAPI };

const noop = () => {
  /* noop */
};

const TRACEPARENT_HEADER_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
