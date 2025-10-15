/* eslint-disable no-console */

import type { LogFields, LogLevel, PulseContext, PulseOrigin, PulseSpan } from "./typings.js";
import { encodeSpanId, encodeTraceId } from "./util.generate-ids.js";

type Options = {
  /**
   * Prefix to be printed before every message.
   */
  prefix?: (level: Exclude<LogLevel, "silent">) => string;

  /**
   * Custom timestamp formatter. Defaults to HH:mm:ss.SSS (local time, no date
   * and timezone).
   */
  formatTimestamp?: (ts: number) => string;
};

export type ConsoleWriter = (
  origin: PulseOrigin,
  level: Exclude<LogLevel, "silent">,
  ts: number,
  message: string,
  span: PulseSpan | undefined,
  context: PulseContext | undefined,
  fields: LogFields,
) => void;

/**
 * Very small, allocation-light console writer for single-tenant use.
 * - Strips projectId/coloId/continentId from origin
 * - Optional prefix for embedding in external apps
 */
export function makeConsoleWriter(opts: Options = {}): ConsoleWriter {
  const { prefix, formatTimestamp = defaultFormatTimestamp } = opts;

  //
  // STEP: build core logger callbacks once
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodForLevel: Record<Exclude<LogLevel, "silent">, (...args: any[]) => void> = {
    verbose: console.debug ? console.debug.bind(console) : console.log.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
    info: console.info ? console.info.bind(console) : console.log.bind(console),
    warn: console.warn ? console.warn.bind(console) : console.log.bind(console),
    error: console.error ? console.error.bind(console) : console.log.bind(console),
    fatal: console.error ? console.error.bind(console) : console.log.bind(console),
  };

  if (prefix) {
    methodForLevel.verbose = methodForLevel.verbose.bind(console, prefix("verbose"));
    methodForLevel.debug = methodForLevel.debug.bind(console, prefix("debug"));
    methodForLevel.info = methodForLevel.info.bind(console, prefix("info"));
    methodForLevel.warn = methodForLevel.warn.bind(console, prefix("warn"));
    methodForLevel.error = methodForLevel.error.bind(console, prefix("error"));
    methodForLevel.fatal = methodForLevel.fatal.bind(console, prefix("fatal"));
  }

  //
  // STEP: build the actual logger callback
  //
  return (origin, level, ts, message, span, context, fields) => {
    methodForLevel[level](formatTimestamp(ts), message, {
      ...context,
      ...fields,
      ...formatSpan(span),
      ...formatOrigin(origin),
    });
  };
}

function defaultFormatTimestamp(ts: number): string {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const mmm = String(date.getMilliseconds()).padStart(3, "0");

  return `[${hh}:${mm}:${ss}.${mmm}]`;
}

function formatOrigin(origin: PulseOrigin): { origin: Record<string, string> } {
  const out: Record<string, string> = {
    path: origin.serviceNamespace + "." + origin.serviceName,
  };

  if (origin.networkId) {
    out["networkId"] = origin.networkId;
  }

  return { origin: out };
}

function formatSpan(span: PulseSpan | undefined): { trace: Record<string, string> } | undefined {
  if (!span) {
    return;
  }

  // Keep the useful tracing IDs; drop any overly verbose extras if present
  const { traceId, traceName, spanId, parentSpanId } = span;
  const trace: Record<string, string> = {
    traceId: encodeTraceId(traceId),
    traceName,
    spanId: encodeSpanId(spanId),
  };

  if (parentSpanId) {
    trace["parentSpanId"] = encodeSpanId(parentSpanId);
  }

  return { trace };
}
