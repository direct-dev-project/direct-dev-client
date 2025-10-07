import { it, expect } from "vitest";

import { parseLogSampling } from "../util.parse-log-sampling.js";

it("parses wildcard only", () => {
  const cfg = parseLogSampling("*:0.3", "any.origin.path");

  expect(cfg.verbose.default).toBe(0.3);
  expect(cfg.debug.default).toBe(0.3);
  expect(cfg.info.default).toBe(0.3);
  expect(cfg.warn.default).toBe(0.3);
  expect(cfg.error.default).toBe(0.3);

  expect(cfg.verbose.byTrace).toEqual({});
  expect(cfg.debug.byTrace).toEqual({});
  expect(cfg.info.byTrace).toEqual({});
  expect(cfg.warn.byTrace).toEqual({});
  expect(cfg.error.byTrace).toEqual({});
});

it("last write wins for wildcard", () => {
  const cfg = parseLogSampling("*:0.1  *:0.9", "x");

  expect(cfg.verbose.default).toBe(0.9);
  expect(cfg.debug.default).toBe(0.9);
  expect(cfg.info.default).toBe(0.9);
  expect(cfg.warn.default).toBe(0.9);
  expect(cfg.error.default).toBe(0.9);
});

it("origin fallback wins over wildcard when selector matches (startsWith)", () => {
  const cfg = parseLogSampling("*:0.2 origin:rpc.mirror:0.8", "rpc.mirror.worker");

  // default factor becomes 0.8 due to matching origin
  expect(cfg.verbose.default).toBe(0.8);
  expect(cfg.debug.default).toBe(0.8);
  expect(cfg.info.default).toBe(0.8);
  expect(cfg.warn.default).toBe(0.8);
  expect(cfg.error.default).toBe(0.8);
});

it("origin specificity: most specific matching selector wins", () => {
  const cfg = parseLogSampling(
    "origin:rpc:0.1 origin:rpc.mirror:0.7 origin:rpc.mirror.worker:0.6",
    "rpc.mirror.worker",
  );

  expect(cfg.verbose.default).toBe(0.6);
  expect(cfg.debug.default).toBe(0.6);
  expect(cfg.info.default).toBe(0.6);
  expect(cfg.warn.default).toBe(0.6);
  expect(cfg.error.default).toBe(0.6);
});

it("level clamping uses Math.max(defaultFactor, levelFactor) (cannot lower)", () => {
  const cfg = parseLogSampling("*:0.2 level:info:0.1 level:warn:0.9", "x");

  // info cannot be lowered below 0.2
  expect(cfg.info.default).toBe(0.2);
  // warn raised above wildcard
  expect(cfg.warn.default).toBe(0.9);
  // others remain at wildcard
  expect(cfg.verbose.default).toBe(0.2);
  expect(cfg.debug.default).toBe(0.2);
  expect(cfg.error.default).toBe(0.2);
});

it("trace entries are kept only when strictly greater than the level base", () => {
  const cfg = parseLogSampling("*:0.2 level:info:0.5 trace:foo:0.5 trace:bar:0.7 trace:baz:0.1", "x");

  // Bases
  expect(cfg.info.default).toBe(0.5);
  expect(cfg.warn.default).toBe(0.2);

  // For info (base 0.5): keep only bar (0.7)
  expect(cfg.info.byTrace).toEqual({ bar: 0.7 });

  // For warn (base 0.2): keep foo (0.5) and bar (0.7); drop baz (0.1)
  expect(cfg.warn.byTrace).toEqual({ foo: 0.5, bar: 0.7 });

  // For error/verbose/debug (base 0.2): same as warn
  expect(cfg.error.byTrace).toEqual({ foo: 0.5, bar: 0.7 });
  expect(cfg.verbose.byTrace).toEqual({ foo: 0.5, bar: 0.7 });
  expect(cfg.debug.byTrace).toEqual({ foo: 0.5, bar: 0.7 });
});

it("combines wildcard, origin, level, and trace with current precedence behavior", () => {
  const cfg = parseLogSampling(
    "*:0 origin:rpc.mirror:0.4 level:error:1 trace:hot:0.9 trace:cold:0.1",
    "rpc.mirror.sub",
  );

  // Defaults
  expect(cfg.verbose.default).toBe(0.4);
  expect(cfg.debug.default).toBe(0.4);
  expect(cfg.info.default).toBe(0.4);
  expect(cfg.warn.default).toBe(0.4);
  expect(cfg.error.default).toBe(1);

  // Trace filtering relative to each base
  // For non-error levels (base 0.4): keep hot (0.9), drop cold (0.1)
  expect(cfg.verbose.byTrace).toEqual({ hot: 0.9 });
  expect(cfg.debug.byTrace).toEqual({ hot: 0.9 });
  expect(cfg.info.byTrace).toEqual({ hot: 0.9 });
  expect(cfg.warn.byTrace).toEqual({ hot: 0.9 });

  // For error (base 1): nothing is > 1
  expect(cfg.error.byTrace).toEqual({});
});

it("is whitespace-insensitive", () => {
  const cfg = parseLogSampling("   *:0.25 \n\t level:warn:0.5  ", "x");

  expect(cfg.warn.default).toBe(0.5);
  expect(cfg.info.default).toBe(0.25);
  expect(cfg.error.default).toBe(0.25);
  expect(cfg.debug.default).toBe(0.25);
  expect(cfg.verbose.default).toBe(0.25);
});

it("validates that factor is a number in [0..1]", () => {
  expect(() => parseLogSampling("*:nope", "x")).toThrowError();
  expect(() => parseLogSampling("*:-0.1", "x")).toThrowError();
  expect(() => parseLogSampling("*:1.1", "x")).toThrowError();

  const low = parseLogSampling("*:0", "x");
  const high = parseLogSampling("*:1", "x");
  expect(low.info.default).toBe(0);
  expect(high.info.default).toBe(1);
});

it("errors on malformed tokens", () => {
  expect(() => parseLogSampling("*:0:1", "x")).toThrowError(); // extra colon
  expect(() => parseLogSampling("origin:only-selector", "rpc.mirror")).toThrowError();
  expect(() => parseLogSampling("trace:only-selector", "x")).toThrowError();
  expect(() => parseLogSampling("level:info", "x")).toThrowError();
  expect(() => parseLogSampling("gibberish:0.1", "x")).toThrowError();
});

it("level tokens accept only known levels", () => {
  expect(() => parseLogSampling("level:silent:0.3", "x")).toThrowError();
  expect(() => parseLogSampling("level:nope:0.3", "x")).toThrowError();
});
