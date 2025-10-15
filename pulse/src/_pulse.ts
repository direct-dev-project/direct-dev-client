import { asyncTimeout, LRUCache } from "@direct.dev/shared";

import type { PulseExporter } from "./_exporter.js";
import { LOG_LEVEL_RANK } from "./constants.js";
import { type PulseInstrument } from "./instrument._base.js";
import type { PulseMetaInstruments } from "./telemetry.js";
import { makePulseMetaInstruments } from "./telemetry.js";
import type {
  LogFields,
  PulseContext,
  PulseOrigin,
  LogLevel,
  InstrumentRecordArgInference,
  TraceEvent,
  PulseSpan,
  PulseSpanKind,
  CounterDataPoint,
  GaugeDataPoint,
  HistogramDataPoint,
  UpDownCounterDataPoint,
} from "./typings.js";
import { decodeSpanId, decodeTraceId, generateSpanId, generateTraceId } from "./util.generate-ids.js";
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
   * Optionally apply a redactor function to ensure that log fields to not carry
   * unwanted data. By default no redaction is applied.
   */
  logRedactor?: (fields: LogFields) => LogFields;

  /**
   * Specifies the interval in which metrics and other telemetry streams are
   * exported to backend.
   *
   * @default 15_000
   */
  metricExportIntervalMs?: number;

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
   * Exporter instance which emits ingested telemetry to the backend.
   */
  exporter: (origin: PulseOrigin) => PulseExporter;
};

type ParsedPulseOptions = {
  logLevel: ParsedLogLevel;
  logSampling: ParsedLogSampling;
  traceSampling: ParsedTraceSampling;

  /**
   * A set of trace names, which contains overrides to log configurations; used
   * in runtime to allow very fast checks on whether or not new PulseLogAPI
   * must be created.
   */
  __logOverridesByTrace: Set<string>;

  /**
   * A cache of PulseLogAPI by traceName, used when specific traces apply
   * overrides to configurations.
   */
  __logCache: LRUCache<string, PulseLogAPI> | Map<string, PulseLogAPI>;
};

const _errorCode = Symbol("errorCode");
const _message = Symbol("message");
const _attributes = Symbol("attributes");
const _events = Symbol("events");
const _waitUntil = Symbol("waitUntil");

const _span = Symbol("span");
const _ctx = Symbol("ctx");

/**
 * Nested .log.* API which provides a unified and optimized signature for
 * emitting log record to OTLP backend.
 */
type PulseLogAPI = Readonly<
  Record<Exclude<LogLevel, "silent">, (message: string, fields?: LogFields | (() => LogFields)) => void>
> & {
  [_span]?: PulseSpan;
  [_ctx]?: PulseContext;
};

/**
 * Generic type for instruments with a .record method, which allows union of
 * variable-length arguments within new Pulse().
 *
 * If not using this on generic types, then TypeScript will complain later on
 * about not being able to merge instruments with/without labels and attributes
 * due to the .record overrides requiring different number of arguments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyInstrument = Omit<PulseInstrument, "record"> & { record: (...args: any[]) => void };

/**
 * Nested .record.* API, which provides access to record metrics through the
 * available instruments within the pulse instance.
 */
export type PulseRecordAPI<TInstruments extends Record<string, AnyInstrument>> = {
  [K in keyof TInstruments]: (
    ...args: Parameters<TInstruments[K]["record"]> extends InstrumentRecordArgInference<infer U> ? U : []
  ) => void;
} & {
  [_span]?: PulseSpan;
};

/**
 * Nested .trace.* API, which enables runtimes to enrich traces with additional
 * data during runtime.
 */
type PulseTraceAPI = {
  [_span]?: PulseSpan;
  [_ctx]?: PulseContext;
  [_errorCode]?: string;
  [_message]?: string;
  [_attributes]?: LogFields;
  [_events]?: TraceEvent[];
  [_waitUntil]?: Array<Promise<void>>;

  /**
   * Mark the trace as failed, regardless of outcome of the callback (allows
   * raising errors in telemetry even if no runtime exceptions are thrown).
   */
  setError: (this: PulseTraceAPI, errorCode: string, message: string) => void;

  /**
   * Add attributes to the exported trace, to allow finegrained details to be
   * added at runtime.
   */
  setAttributes: (this: PulseTraceAPI, attributes: LogFields) => void;

  /**
   * Add events to the trace, which are included when the trace is exported
   * to telemetry backend.
   */
  addEvent: (this: PulseTraceAPI, eventName: string, attributes?: LogFields) => void;

  /**
   * Add a background promise, which will be awaited prior to closing the
   * trace (useful to track complete response performance, when returning a
   * readable stream which doesn't close until later)
   */
  waitUntil: (this: PulseTraceAPI, promise: Promise<void>) => void;

  /**
   * extract PulseTrace from provided request headers
   */
  fromRequestHeaders(
    this: PulseTraceAPI,
    headers: Headers,
  ): Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | undefined;

  /**
   * Exports current trace span as Request Headers object suitable for usage
   * with `fetch()` requests.
   */
  toRequestHeaders(this: PulseTraceAPI): { traceparent: string; "x-direct-tracename": string } | undefined;

  /**
   * Exports current span to be used as parent for subsequent spans during
   * tracing.
   */
  exportTraceParent(this: PulseTraceAPI): Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | undefined;
};

/**
 * The PulseAPI defines public interface for ingesting telemetry within the
 * application.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PulseAPI<TInstruments extends Record<string, AnyInstrument> = any> = {
  [_span]?: PulseSpan;
  [_ctx]?: PulseContext;

  log: PulseLogAPI;
  trace: PulseTraceAPI;
  record: PulseRecordAPI<TInstruments>;

  /**
   * Create a trace span, which instantiates a new PulseAPI automatically
   * associating all emitted telemetry to this trace.
   */
  runSpan<T>(
    trace: {
      parent?: Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | Headers;
      parentRelationship?: "parent" | "link";
      kind: PulseSpanKind;
    },
    context: PulseContext,
    cb: (t: PulseAPI<TInstruments>) => Promise<T> | T,
  ): Promise<T>;

  /**
   * Create a contextualized PulseAPI, which automatically associates all
   * emitted telemetry with the given context without creating a trace.
   */
  runInContext<T>(context: PulseContext, cb: (t: PulseAPI<TInstruments>) => Promise<T> | T): Promise<T>;

  /**
   * Utility to create a child of this PulseAPI pre-bound to the provided
   * context variables.
   */
  with(ctx?: Partial<PulseContext>, span?: PulseSpan): PulseAPI<TInstruments>;
};

/**
 * Implementation of the PulseSpanAPI proto, which is used to enrich current
 * trace span.
 */
const PULSE_TRACE_API_PROTO = Object.freeze<PulseTraceAPI>({
  setError(errorCode, message) {
    this[_errorCode] = errorCode;
    this[_message] = message;
  },

  setAttributes(attributes) {
    this[_attributes] = {
      ...this[_attributes],
      ...attributes,
    };
  },

  addEvent(eventName, attributes) {
    this[_events] ??= [];
    this[_events].push({ timeStamp: Date.now(), name: eventName, attributes });
  },

  waitUntil(promise) {
    this[_waitUntil] ??= [];
    this[_waitUntil].push(promise);
  },

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
      traceId: decodeTraceId(traceId),
      traceName,
      parentSpanId: decodeSpanId(parentSpanId),
      traceSampled: (parseInt(flagsHex, 16) & 0x01) === 0x01,
    };
  },

  toRequestHeaders() {
    if (!this[_span]) {
      return undefined;
    }

    return {
      traceparent: `00-${this[_span].traceId}-${this[_span].spanId}-${this[_span].traceSampled ? "01" : "00"}`,
      "x-direct-tracename": this[_span].traceName,
    };
  },

  exportTraceParent(): Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | undefined {
    if (!this[_span]) {
      return undefined;
    }

    return {
      traceId: this[_span].traceId,
      traceName: this[_span].traceName,
      traceSampled: this[_span].traceSampled,
      parentSpanId: this[_span].spanId,
    };
  },
});

const PULSE_TRACE_API_STATE: PropertyDescriptorMap = {
  [_span]: { value: undefined, writable: true, enumerable: false, configurable: true },
  [_ctx]: { value: undefined, writable: true, enumerable: false, configurable: true },
  [_errorCode]: { value: undefined, writable: true, configurable: true },
  [_message]: { value: undefined, writable: true, configurable: true },
  [_attributes]: { value: undefined, writable: true, configurable: true },
  [_events]: { value: undefined, writable: true, configurable: true },
  [_waitUntil]: { value: undefined, writable: true, configurable: true },
};

const PULSE_API_STATE: PropertyDescriptorMap = {
  [_span]: { value: undefined, writable: true, enumerable: false, configurable: true },
  [_ctx]: { value: undefined, writable: true, enumerable: false, configurable: true },
};
export function makePulseAPITemplate<TInstruments extends Record<string, AnyInstrument>>(
  originPath: string,
  options: PulseOptions,
  instruments: TInstruments,
  metaInstruments: PulseMetaInstruments,
  exporter: PulseExporter,
): PulseAPI<TInstruments> {
  const parsedOptions = parseOptions(options, originPath);

  const traceProto = PULSE_TRACE_API_PROTO;
  const logProto = makePulseLogProto(options, parsedOptions, metaInstruments, exporter);
  const recordProto = makePulseMetricsProto(instruments);

  const pulseTemplate: PulseAPI<TInstruments> = Object.create(null, {
    //
    // create nested APIs (writeable to allow overrides within the .with
    // callback to adjust context quickly)
    //
    trace: {
      writable: true,
      value: Object.create(traceProto, PULSE_TRACE_API_STATE) as PulseTraceAPI,
    },
    log: {
      writable: true,
      value: Object.create(logProto, PULSE_LOG_API_STATE) as PulseLogAPI,
    },
    record: {
      writable: true,
      value: Object.create(recordProto, PULSE_METRICS_API_STATE) as PulseRecordAPI<TInstruments>,
    },

    //
    // create with callback, which builds a new PulseAPI instance where context
    // is update to reflect new values
    //
    with: {
      writable: false,
      value: function withFnc(
        this: PulseAPI<TInstruments>,
        ctx: PulseContext | undefined,
        span: PulseSpan | undefined,
      ) {
        const pulse = Object.create(pulseTemplate) as PulseAPI<TInstruments>;
        const newSpan = span ?? this[_span];

        let newContext: PulseContext | undefined;

        if (!ctx) {
          newContext = this[_ctx];
        } else {
          newContext = Object.create(this[_ctx] ?? null) as PulseContext;

          for (const k in ctx) {
            newContext[k] = ctx[k];
          }
        }

        pulse[_span] = newSpan;
        pulse[_ctx] = newContext;

        pulse.trace = Object.create(traceProto, PULSE_TRACE_API_STATE);
        pulse.trace[_span] = newSpan;

        pulse.record = Object.create(recordProto, PULSE_METRICS_API_STATE);
        pulse.record[_span] = newSpan;

        //
        // generate logger functions; this is slightly more involved as we may
        // need to adjust sampling and level due to having specific trace
        // configurations
        //
        // 1) check if a new root span was given, and in that case check if any
        //    specific overrides exists for that trace
        // 2) if so, create a new log template with configurations updated for
        //    the specific span
        // 3) if not, re-use existing log template for nested structure
        //

        let subLogProto: PulseLogAPI | undefined;
        const isRootSpan = span && !this[_span];

        if (!isRootSpan || !parsedOptions.__logOverridesByTrace.has(span.traceName)) {
          subLogProto = this.log;
        } else {
          subLogProto = parsedOptions.__logCache.get(span.traceName);

          if (!subLogProto) {
            subLogProto = makePulseLogProto(options, parsedOptions, metaInstruments, exporter, span);
            parsedOptions.__logCache.set(span.traceName, subLogProto);
          }
        }

        pulse.log = Object.create(subLogProto, PULSE_LOG_API_STATE);
        pulse.log[_span] = newSpan;
        pulse.log[_ctx] = newContext;

        return pulse;
      },
    },

    //
    // create runInContext, which dispatches the given callback and provides a
    // PulseAPI which includes provided context variables for all emitted logs
    // and traces
    //
    runInContext: {
      writable: false,
      value: async function runInContext<T>(
        this: PulseAPI<TInstruments>,
        context: PulseContext,
        cb: (t: PulseAPI<TInstruments>) => Promise<T> | T,
      ): Promise<T> {
        const t = this.with(context);

        try {
          return await cb(t);
        } catch (err) {
          t.log.error("runInContext intercepted exception", { err });

          throw err;
        }
      },
    },

    //
    // create runSpan, which dispatches the given callback within a trace span
    // and automatically exports collected telemetry to the observability
    // backend
    //
    runSpan: {
      writable: false,
      value: async function runSpan<T>(
        this: PulseAPI<TInstruments>,
        trace: {
          parent?: Omit<PulseSpan, "spanId" | "spanKind" | "parentLink"> | Headers;
          parentRelationship?: "parent" | "link";
          kind: PulseSpanKind;
        },
        context: PulseContext,
        cb: (t: PulseAPI<TInstruments>) => Promise<T> | T,
      ): Promise<T> {
        const startTimestamp = Date.now();

        //
        // STEP: generate trace context based on input
        //

        const traceParent = (() => {
          const explicitParent =
            trace.parent && trace.parent instanceof Headers
              ? this.trace.fromRequestHeaders(trace.parent)
              : trace.parent;

          return explicitParent ?? this.trace.exportTraceParent();
        })();

        const span = ((): PulseSpan => {
          //
          // NO PARENT: create a new root span and perform sampling
          //
          if (traceParent?.parentSpanId == null) {
            const samplingFactor =
              parsedOptions.traceSampling.byEvent[context.event] ?? parsedOptions.traceSampling.default;

            return {
              traceId: generateTraceId(),
              traceName: context.event,
              traceSampled: samplingFactor === 1 ? true : samplingFactor === 0 ? false : Math.random() < samplingFactor,
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
          const samplingFactor = parsedOptions.traceSampling.byEvent[context.event];

          if (trace.parentRelationship !== "link") {
            return {
              ...traceParent,
              traceSampled:
                samplingFactor == null
                  ? // if no explicit byEvent sampling override was provided, then
                    // re-use parent sampling status
                    traceParent.traceSampled
                  : // ... otherwise perform sampling, avoiding Math.random() if
                    // result is deterministic
                    samplingFactor === 1
                    ? true
                    : samplingFactor === 0
                      ? false
                      : Math.random() < samplingFactor,
              parentLink: undefined,
              spanId: generateSpanId(),
              spanKind: trace.kind,
            };
          }

          //
          // LINKED PARENT: create a new root span with automatic re-sampling,
          // and link to parent span
          //
          return {
            traceId: generateTraceId(),
            traceName: traceParent.traceName,
            traceSampled:
              samplingFactor == null
                ? // if no explicit byEvent sampling override was provided, then
                  // re-use parent sampling status
                  traceParent.traceSampled
                : // ... otherwise perform sampling, avoiding Math.random() if
                  // result is deterministic
                  samplingFactor === 1
                  ? true
                  : samplingFactor === 0
                    ? false
                    : Math.random() < samplingFactor,
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

        // observability of sampling decisions
        metaInstruments.traceDecisionCount.record(
          span,
          1,
          span.traceSampled ? "decision:included" : "decision:not_sampled",
        );

        //
        // STEP: perform callback and collect traces
        //

        let didFail = false;
        const t = this.with(context, span);

        try {
          try {
            return await cb(t);
          } finally {
            if (t.trace[_waitUntil]) {
              await Promise.allSettled(t.trace[_waitUntil]);
            }
          }
        } catch (err) {
          didFail = true;

          if (t.trace[_errorCode] == null) {
            // if an error wasn't manually raised for the trace, then fail the
            // trace based on this error message
            exporter.trace(
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
                ...t.trace[_attributes],
                error_code: "UNCAUGHT",
              },
              t.trace[_events],
              {
                startTimestamp,
                endTimestamp: Date.now(),
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
          if (t.trace[_errorCode] != null) {
            // if an error was raised manually, then fail the trace with that
            // specific error message
            exporter.trace(
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
                ...t.trace[_attributes],
                error_code: t.trace[_errorCode],
              },
              t.trace[_events],
              {
                startTimestamp,
                endTimestamp: Date.now(),
                success: false,
                message: t.trace[_message],
              },
            );
          } else if (!didFail && span.traceSampled) {
            // if the span completed successfully, then determine whether we
            // should export the trace based on sampling configurations
            exporter.trace(span, context, t.trace[_attributes], t.trace[_events], {
              startTimestamp,
              endTimestamp: Date.now(),
              success: true,
              message: undefined,
            });
          }
        }
      },
    },
  });

  return Object.create(pulseTemplate, PULSE_API_STATE);
}

const PULSE_METRICS_API_STATE: PropertyDescriptorMap = {
  [_span]: { value: undefined, writable: true, enumerable: false, configurable: true },
};

/**
 * Internal helper, which wraps provided instruments with record methods that
 * auto-inject current span.
 */
function makePulseMetricsProto<TInstruments extends Record<string, AnyInstrument>>(
  instruments: TInstruments,
): PulseRecordAPI<TInstruments> {
  const rec: PulseRecordAPI<TInstruments> = Object.create(null);
  rec[_span] = undefined;

  for (const [key, instrument] of Object.entries(instruments) as Iterable<
    [keyof TInstruments, TInstruments[keyof TInstruments]]
  >) {
    rec[key] = function (this: PulseRecordAPI<TInstruments>, ...args: unknown[]) {
      instrument.record(this[_span], ...args);
    } as unknown as PulseRecordAPI<TInstruments>[typeof key];
  }

  return Object.freeze(rec);
}

const PULSE_LOG_API_STATE: PropertyDescriptorMap = {
  [_span]: { value: undefined, writable: true, enumerable: false, configurable: true },
  [_ctx]: { value: undefined, writable: true, enumerable: false, configurable: true },
};

/**
 * Internal helper, which generates the logging API to be used with
 */
function makePulseLogProto(
  options: PulseOptions,
  parsedOptions: ParsedPulseOptions,
  metaInstruments: PulseMetaInstruments,
  exporter: PulseExporter,
  trace?: PulseSpan,
): PulseLogAPI {
  // hoist variables from context
  const { logRedactor } = options;

  // tiny utility to build logWriters per-level with sampling and redaction
  // built in
  const makeLogWriter = (
    level: Exclude<LogLevel, "silent">,
  ): ((this: PulseLogAPI, message: string, fields?: LogFields | (() => LogFields)) => void) => {
    // read configurations
    const minLevel = trace
      ? (parsedOptions.logLevel.byTrace[trace.traceName] ?? parsedOptions.logLevel.default)
      : parsedOptions.logLevel.default;
    const samplingFactor = trace
      ? (parsedOptions.logSampling[level].byTrace[trace.traceName] ?? parsedOptions.logSampling[level].default)
      : parsedOptions.logSampling[level].default;

    // fast path: silently drop fully ignored statements (no sampling or
    // level too low)
    const forceSample = !!trace?.traceSampled; // all logs forced if trace is sampled
    const alwaysSample = samplingFactor === 1 || forceSample;
    const neverSample = samplingFactor === 0 && !forceSample;

    if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[minLevel]) {
      return function noop() {
        metaInstruments.logDecisionCount.record(this[_span], 1, "decision:below_log_level");
      };
    }

    if (neverSample) {
      return function noop() {
        metaInstruments.logDecisionCount.record(this[_span], 1, "decision:not_sampled");
      };
    }

    // fast path: if sampling should always happen, then return callback
    // without sampling branch
    if (alwaysSample) {
      return logRedactor
        ? function (this: PulseLogAPI, message, _fields) {
            exporter.log(
              level,
              Date.now(),
              message,
              this[_span],
              this[_ctx],
              _fields ? logRedactor(typeof _fields === "function" ? _fields() : _fields) : undefined,
            );

            metaInstruments.logDecisionCount.record(this[_span], 1, "decision:included");
          }
        : function (this: PulseLogAPI, message, _fields) {
            exporter.log(
              level,
              Date.now(),
              message,
              this[_span],
              this[_ctx],
              _fields ? (typeof _fields === "function" ? _fields() : _fields) : undefined,
            );

            metaInstruments.logDecisionCount.record(this[_span], 1, "decision:included");
          };
    }

    // otherwise create a callback that performs sampling at runtime
    return logRedactor
      ? function (this: PulseLogAPI, message, _fields) {
          if (Math.random() >= samplingFactor) {
            metaInstruments.logDecisionCount.record(this[_span], 1, "decision:not_sampled");
            return;
          }

          exporter.log(
            level,
            Date.now(),
            message,
            this[_span],
            this[_ctx],
            _fields ? logRedactor(typeof _fields === "function" ? _fields() : _fields) : undefined,
          );

          metaInstruments.logDecisionCount.record(this[_span], 1, "decision:included");
        }
      : function (this: PulseLogAPI, message, _fields) {
          if (Math.random() >= samplingFactor) {
            // silently drop if not sampled
            return;
          }

          exporter.log(
            level,
            Date.now(),
            message,
            this[_span],
            this[_ctx],
            _fields ? (typeof _fields === "function" ? _fields() : _fields) : undefined,
          );

          metaInstruments.logDecisionCount.record(this[_span], 1, "decision:included");
        };
  };

  return Object.freeze({
    verbose: makeLogWriter("verbose"),
    debug: makeLogWriter("debug"),
    info: makeLogWriter("info"),
    warn: makeLogWriter("warn"),
    error: makeLogWriter("error"),
    fatal: makeLogWriter("fatal"),
  });
}

const PARSED_OPTIONS_CACHE = new LRUCache<string, ParsedPulseOptions>(50);
const PARSED_OPTIONS_LOG_CACHE_SIZE = 50;

/**
 * Parse provided options for blazingly fast runtime lookups and decisions
 * regarding sampling and verbosity.
 */
function parseOptions(options: PulseOptions, originPath: string): ParsedPulseOptions {
  // extract parsed options from in-memory cache if they already exist; this
  // helps reduce churn on nested PulseLogAPI lookups by sharing the same cache
  // over-and-over
  const cacheKey = options.logLevel + "|" + options.logSamples + "|" + options.traceSamples + "|" + originPath;
  const cache = PARSED_OPTIONS_CACHE.get(cacheKey);

  if (cache) {
    return cache;
  }

  // parse core options
  const logLevel = parseLogLevel(options.logLevel, originPath);
  const logSampling = parseLogSampling(options.logSamples, originPath);
  const traceSampling = parseTraceSampling(options.traceSamples, originPath);

  // extract a static set of trace names, which contain specific config
  // overrides; used to do O(1) lookups of potential config overrides when
  // creating nested contexts in runtime
  const logOverridesByTrace = new Set<string>([
    ...Object.keys(logLevel.byTrace),
    ...Object.values(logSampling).flatMap((it) => Object.keys(it.byTrace)),
  ]);

  // build a cache for nested log configurations; use an LRUCache if potential
  // set of overrides exceeds the maximum allowed size - otherwise fallback to
  // plain map for maximum performance during runtime
  const logCache =
    logOverridesByTrace.size > PARSED_OPTIONS_LOG_CACHE_SIZE
      ? new LRUCache<string, PulseLogAPI>(PARSED_OPTIONS_LOG_CACHE_SIZE)
      : new Map<string, PulseLogAPI>();

  const parsedOptions = {
    logLevel,
    logSampling,
    traceSampling,

    __logCache: logCache,
    __logOverridesByTrace: logOverridesByTrace,
  };

  PARSED_OPTIONS_CACHE.set(cacheKey, parsedOptions);

  return parsedOptions;
}

/**
 * Pulse enables hierarchical and structured emission of telemetry, with
 * built-in sampling, distributed tracing and support for exporters based on
 * current runtime environment.
 *
 * Pulse is fully compatible with both Edge and Browser runtimes
 */
export class Pulse<TInstruments extends Record<string, AnyInstrument>> implements PulseAPI<TInstruments> {
  #instruments: PulseInstrument[];
  #metaInstruments = makePulseMetaInstruments();

  /**
   * Internal reference to the exporter associated with this Pulse instance
   */
  #exporter: PulseExporter;

  /**
   * Internal reference to the PulseAPI, which is used under-the-hood for all
   * telemetry collection and publicly re-exported for convenient access.
   */
  #api: PulseAPI<TInstruments>;

  /**
   * Configured interval for exporting metrics.
   *
   * @default 15_000
   */
  #metricExportIntervalMs: number;

  /**
   * If automatic exporting of metrics is enabled, then this property contains
   * a reference to the bound interval.
   */
  #metricExportIntervalId: NodeJS.Timeout | number | undefined;

  /**
   * Specifies if manual flushing has been scheduled, preventing multiple
   * schedules at once.
   */
  #isFlushScheduled = false;

  /**
   * Specifies if metrics are currently being flushed, used to prevent multiple
   * flushes happening concurrently.
   */
  #isExporting = false;

  constructor(origin: PulseOrigin, options: PulseOptions, instruments: TInstruments) {
    const originPath = origin.serviceNamespace
      ? origin.serviceNamespace + "." + origin.serviceName
      : origin.serviceName;

    this.#instruments = Object.values(instruments) as PulseInstrument[];
    this.#exporter = options.exporter(origin);
    this.#api = makePulseAPITemplate(originPath, options, instruments, this.#metaInstruments, this.#exporter);

    // cache options used when exporting
    this.#metricExportIntervalMs = options.metricExportIntervalMs ?? 15_000;

    //
    // expose API directly for convenience
    //
    this.log = this.#api.log;
    this.trace = this.#api.trace;
    this.record = this.#api.record;
    this.with = this.#api.with.bind(this.#api);
    this.runSpan = this.#api.runSpan.bind(this.#api);
    this.runInContext = this.#api.runInContext.bind(this.#api);
  }

  /**
   * Schedules a one-shot export after `metricExportIntervalMs`.
   *
   * If an interval export is active, this throws.
   * If a one-shot is already scheduled, returns undefined.
   *
   * Designed to be used for manually controlled exports of metrics.
   */
  async scheduleFlush(): Promise<void> {
    if (this.#metricExportIntervalId != null) {
      throw new Error("Pulse.scheduleFlush(): not allowed while activateAutoExport() is managing automatic flushing.");
    }

    if (this.#isFlushScheduled) {
      return;
    }

    try {
      this.#isFlushScheduled = true;

      await asyncTimeout(this.#metricExportIntervalMs);
      await this.export();
    } finally {
      this.#isFlushScheduled = false;
    }
  }

  /**
   * Activate automatic exporting of metrics in the defined interval. Designed
   * to be used in response to "activation" lifecycle hooks.
   */
  activateAutoExport(): void {
    if (this.#isFlushScheduled) {
      throw new Error("Pulse.activateAutoFlush(): not allowed when manual call to scheduleFlush() is pending");
    }

    if (this.#metricExportIntervalId != null) {
      // silently stop if exporting is already activated
      return;
    }

    this.#metricExportIntervalId = setInterval(() => {
      this.export(false);
    }, this.#metricExportIntervalMs);
  }

  /**
   * Stop automatic exporting of metrics, ensuring that any metrics collected
   * during the latest window are immediately flushed.
   *
   * Designed to be used in response to "deactivation" lifecycle hooks.
   */
  async deactivateAutoExport(): Promise<void> {
    if (this.#metricExportIntervalId == null) {
      // if automatic exporting isn't currently running, then do nothing
      return;
    }

    clearInterval(this.#metricExportIntervalId);
    this.#metricExportIntervalId = undefined;

    // auto-flush any metrics collected during the active window
    await this.export();
  }

  /**
   * Internally performs exporting of metrics to the configured exporter, and
   * optionally force flushing all active export streams.
   */
  async export(forceFlush = true): Promise<void> {
    if (this.#isExporting) {
      return;
    }

    this.#isExporting = true;

    try {
      const timestamp = Date.now();

      const metrics: Array<{
        timestamp: number;
        name: string;
        unit: string;
        metrics:
          | [CounterDataPoint, ...CounterDataPoint[]]
          | [UpDownCounterDataPoint, ...UpDownCounterDataPoint[]]
          | [GaugeDataPoint, ...HistogramDataPoint[]]
          | [HistogramDataPoint, ...HistogramDataPoint[]];
      }> = [];

      for (let i = 0, j = this.#instruments.length; i < j; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const instrument = this.#instruments[i]!;
        const { collected, dropped } = instrument.flush();

        if (collected.length > 0) {
          this.#metaInstruments.metricsDecisionCount.record(undefined, collected.length, "decision:included");

          metrics.push({
            timestamp,
            name: instrument.name,
            unit: instrument.unit,

            // @ts-expect-error: we've explicitly verified that collected
            // contains at-least one metric and know each instrument only ever
            // exports a single kind of metric
            metrics: collected,
          });
        }

        if (dropped) {
          this.#metaInstruments.metricsDecisionCount.record(undefined, dropped[0].value, "decision:dropped");

          metrics.push({
            timestamp,
            name: dropped[0].name,
            unit: dropped[0].unit,
            metrics: dropped,
          });
        }
      }

      this.#metaInstruments.flushDurationMs.record(undefined, Date.now() - timestamp);

      //
      // meta observability - append meta observations to observations to be
      // included on push
      //
      const metaMetrics = [
        this.#metaInstruments.flushDurationMs.flush().collected,
        this.#metaInstruments.metricsDecisionCount.flush().collected,
        this.#metaInstruments.logDecisionCount.flush().collected,
        this.#metaInstruments.traceDecisionCount.flush().collected,
      ];

      for (let i = 0, j = metaMetrics.length; i < j; i++) {
        const collected = metaMetrics[i];

        if (!collected?.[0]) {
          continue;
        }

        metrics.push({
          timestamp,
          name: collected[0].name,
          unit: collected[0].unit,

          // @ts-expect-error: we've explicitly verified that collected
          // contains at-least one metric and know each instrument only ever
          // exports a single kind of metric
          metrics: collected,
        });
      }

      // export collected metrics and flush all exporter streams to guarantee
      // full ingestion
      this.#exporter.metrics(metrics);

      if (forceFlush) {
        await this.#exporter.flush();
      }
    } catch (err) {
      this.log.warn("pulse_export_failed", { err, force_flush: forceFlush });
    } finally {
      this.#isExporting = false;
    }
  }

  //
  // Typings for PulseAPI exposed publicly
  //

  log: PulseLogAPI;
  trace: PulseTraceAPI;
  record: PulseRecordAPI<TInstruments>;

  with: PulseAPI<TInstruments>["with"];
  runSpan: PulseAPI<TInstruments>["runSpan"];
  runInContext: PulseAPI<TInstruments>["runInContext"];
}

const TRACEPARENT_HEADER_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;
