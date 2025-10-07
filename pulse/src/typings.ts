import type { Checkpoint } from "@direct.dev/checkpoint";

/**
 * Pulse origins are specified at the top-level, designating the origin of all
 * telemetry emitted through it for structured access.
 */
export type PulseOrigin = {
  /**
   * Optionally specifies the namespace which the service is associated with
   * (e.g. "rpc" or "client").
   */
  serviceNamespace: string | undefined;

  /**
   * Name of the service (e.g. "agent", "mirror", "viem") emitting telemetry.
   */
  serviceName: string;

  /**
   * Optionally specifies the specific instance ID of the environment emitting
   * the telemetry.
   */
  serviceInstanceId: string | undefined;

  /**
   * Version of the service (injected in all telemetry emitted).
   */
  serviceVersion: string;

  /**
   * ID of the project which telemetry is originating from (undefined if running
   * in a non-scoped context).
   */
  projectId: string | undefined;

  /**
   * ID of the block chain network which telemetry is originating from (or
   * undefined if network is not relevant for origin).
   */
  networkId: SupportedNetworkId | undefined;

  /**
   * ID of the Cloudflare Colo in which the origin is running (or undefined, if
   * not relevant for origin)
   */
  coloId: string | undefined;

  /**
   * ID of the Cloudflare Region in which the origin is running (or undefined,
   * if not relevant).
   */
  continentId: string | undefined;

  /**
   * Pre-computed path for origin (<serviceId>.<subServiceId>.<moduleName>).
   */
  originPath: string;
};

/**
 * Pulse context is provided per-trace or per-instantiation, which ensures that
 * metrics and logs are tightly coupled with relevant contextual information.
 */
export type PulseContext = {
  /**
   * The name of the event being handled (e.g. `read-from-cache` or `upstream`).
   */
  event: string;
} & LogFields;

/**
 * Pulse trace spans allow distributed tracing of telemetry across multiple
 * boundaries, following Open Telemetry base specification.
 */
export type PulseSpan = {
  /**
   * The ID of the trace, auto-generated if one is not explicitly provided in
   * order to create a new trace.
   */
  traceId: string;

  /**
   * Name of the flow that initiated the trace; carried with through all levels
   * of the distributed tracing allowing developers to trace related events
   * across trace instances.
   */
  traceName: string;

  /**
   * Specifies if the trace is actively sampled (if not, child spans will be
   * silently ignored unless they error).
   */
  traceSampled: boolean;

  /**
   * Optionally ID of a parent span, which this trace is a child of.
   */
  parentSpanId: string | null | undefined;

  /**
   * Optionally contains a collection of references to other spans to link to.
   */
  parentLink: { traceName: string; traceId: string; spanId: string } | undefined;

  /**
   * Auto-generated ID for the specific span being handled.
   */
  spanId: string;

  /**
   * The kind of span, matching OpenTelemetry specification.
   */
  spanKind: PulseSpanKind;
};

/**
 * Kinds of trace spans supported by Pulse, closely mapped to the OpenTelemetry
 * specification.
 */
export type PulseSpanKind = "INTERNAL" | "CLIENT" | "SERVER" | "PRODUCER" | "CONSUMER";

export type InstrumentRecordArgInference<T extends unknown[]> = [span: PulseSpan | undefined, ...T];

/**
 * Collection of available levels when logging throught the application.
 */
export type LogLevel = "verbose" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

/**
 * Log fields support simple values that can be correctly represented in JSON.
 */
export type LogFields = Record<string, unknown>;

/**
 * Writers receive log statements and are responsible for outputting / storing
 * the data.
 */
export type LogWriter = (
  level: Exclude<LogLevel, "silent">,
  timestamp: HighResTimestamp,
  message: string,
  origin: PulseOrigin,
  span: PulseSpan | undefined,
  context: PulseContext | undefined,
  fields: LogFields,
) => Promise<void>;

/**
 * Branded subtype representing a high-res timestamp compatible with OTLP.
 */
export type HighResTimestamp = string & { readonly __brand: unique symbol };

/**
 * Attributes accepted on exported metrics.
 */
export type MetricAttributes = Record<string, string | number | boolean | null | undefined>;

/**
 * Declarative configuration of attribute schema when instantiating new
 * instruments.
 */

export type MetricAttributesSchema = { [K in keyof MetricAttributes]: Checkpoint<MetricAttributes[K]> };

/**
 * TypeScript gymnastics to infer specific shape of MetricAttributes from a
 * given schema.
 */
export type MetricAttributesFromSchema<T extends MetricAttributesSchema> = {
  [K in keyof T]: T[K] extends Checkpoint<infer U extends MetricAttributes[keyof MetricAttributes]> ? U : never;
};

/**
 * Exemplars are used to associate specific meassurements (metrics) with
 * distributed traces.
 */
export type MetricExemplar = {
  /**
   * The timestamp at which this exemplar was recorded.
   */
  timestamp: HighResTimestamp;

  /**
   * The value of the recorded exemplar.
   */
  value: number | bigint;

  /**
   * The span that this exemplar should be associated with.
   */
  span: PulseSpan;
};

/**
 * Exported data points collected by Counter-like instruments.
 */
export type CounterDataPoint = {
  type: "counter";

  /**
   * The name of the instrument that collected this datapoint.
   */
  name: string;

  /**
   * The unit that the instrument collects values in.
   */
  unit: string;

  /**
   * The value to increment the counter by, aggregated since last flush of the
   * instrument.
   */
  value: number | bigint;

  /**
   * Attributes to associate with the data point.
   */
  attrs: MetricAttributes;

  /**
   * Exemplars linking specific metric values to distributed traces collected
   * during export window.
   */
  exemplars: MetricExemplar[];
};

/**
 * Exported data points collected by UpDownCounter-like instruments.
 */
export type UpDownCounterDataPoint = Omit<CounterDataPoint, "type"> & {
  type: "up_down_counter";
};

/**
 * Exported data points collected by Gauge-like instruments.
 */
export type GaugeDataPoint = {
  type: "gauge";

  /**
   * The name of the instrument that collected this datapoint.
   */
  name: string;

  /**
   * The unit that the instrument collects values in.
   */
  unit: string;

  /**
   * The last observed value prior to flushing of the instrument.
   */
  value: number | bigint;

  /**
   * Attributes to associate with the data point.
   */
  attrs: MetricAttributes;

  /**
   * Exemplars linking specific metric values to distributed traces collected
   * during export window.
   */
  exemplars: MetricExemplar[];
};

/**
 * Exported data points collected by Histogram-like instruments.
 */
export type HistogramDataPoint = {
  type: "histogram";

  /**
   * The name of the instrument that collected this datapoint.
   */
  name: string;

  /**
   * The unit that the instrument collects values in.
   */
  unit: string;

  /**
   * The bucket bounds defined when creating the instrument.
   */
  bounds: [number, ...number[]];

  /**
   * Number of observed values within each bucket derived from the bounds of
   * the instrument.
   */
  counts: [number, number, ...number[]];

  /**
   * The aggregated sum of all observed values, since the instrument was last
   * flushed.
   */
  sum: number;

  /**
   * Attributes to associate with the data point.
   */
  attrs: MetricAttributes;

  /**
   * Exemplars linking specific metric values to distributed traces collected
   * during export window.
   */
  exemplars: MetricExemplar[];
};

export type MetricDataPoint = CounterDataPoint | UpDownCounterDataPoint | GaugeDataPoint | HistogramDataPoint;

/**
 * Grouping of metrics by instrument, optimized for exporting.
 */
export type MetricDataPointGroup =
  | {
      name: string;
      unit: string;
      type: CounterDataPoint["type"];
      dataPoints: CounterDataPoint[];
    }
  | {
      name: string;
      unit: string;
      type: UpDownCounterDataPoint["type"];
      dataPoints: UpDownCounterDataPoint[];
    }
  | {
      name: string;
      unit: string;
      type: GaugeDataPoint["type"];
      dataPoints: GaugeDataPoint[];
    }
  | {
      name: string;
      unit: string;
      type: HistogramDataPoint["type"];
      dataPoints: HistogramDataPoint[];
    };

/**
 * Exporter that receives collected metrics, responsible for ingesting data
 * points into our telemetry database.
 */
export type MetricExporter = (
  timestamp: HighResTimestamp,
  origin: PulseOrigin,
  metrics: MetricDataPointGroup[],
) => Promise<void>;

/**
 * Events recorded as part of a trace span.
 */
export type TraceEvent = {
  timeStamp: HighResTimestamp;
  name: string;
  attributes: LogFields | undefined;
};

/**
 * Exporter receiving traces as they are created during runtime, responsible for
 * ingesting the entry into our telemetry database.
 */
export type TraceExporter = (
  origin: PulseOrigin,
  span: PulseSpan,
  context: PulseContext,
  attributes: LogFields | undefined,
  events: TraceEvent[],
  result: {
    startTimestamp: HighResTimestamp;
    endTimestamp: HighResTimestamp;
    success: boolean;
    message: string | undefined;
  },
) => Promise<void>;
