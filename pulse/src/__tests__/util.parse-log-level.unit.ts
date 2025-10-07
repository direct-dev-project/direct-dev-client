import { it, expect } from "vitest";

import { parseLogLevel } from "../util.parse-log-level.js";

const ORIGIN = "rpc.mirror.RevalidationPlanner";

it("uses wildcard default when only *:<level> is provided", () => {
  const cfg = parseLogLevel("*:info", ORIGIN);
  expect(cfg.default).toBe("info");
  expect(cfg.byTrace).toEqual({});
});

it("defaults to 'silent' when no rules are provided", () => {
  const cfg = parseLogLevel("", ORIGIN);
  expect(cfg.default).toBe("silent");
  expect(cfg.byTrace).toEqual({});
});

it("applies matching origin over wildcard", () => {
  const cfg = parseLogLevel("*:warn origin:rpc.mirror:debug", ORIGIN);
  expect(cfg.default).toBe("debug"); // origin match overrides wildcard
  expect(cfg.byTrace).toEqual({});
});

it("ignores non-matching origin selectors", () => {
  const cfg = parseLogLevel("*:warn origin:rpc.agent:debug", ORIGIN);
  expect(cfg.default).toBe("warn");
});

it("uses most-specific matching origin regardless of order (longest prefix wins)", () => {
  const cfg1 = parseLogLevel("*:warn origin:rpc:info origin:rpc.mirror:debug", ORIGIN);
  const cfg2 = parseLogLevel("*:warn origin:rpc.mirror:debug origin:rpc:info", ORIGIN);
  expect(cfg1.default).toBe("debug");
  expect(cfg2.default).toBe("debug");
});

it("for equal-specificity origin selectors, later token wins (tie-breaker)", () => {
  // both have same length "rpc" vs "rpc" (1 segment / 3 chars);
  // later token should override earlier
  const cfg = parseLogLevel("*:warn origin:rpc:info origin:rpc:debug", ORIGIN);
  expect(cfg.default).toBe("debug");
});

it("origin selector treats token as a single string; dots are part of selector", () => {
  // Your implementation expects "origin:<selector>:<level>" with exactly 3
  // parts. The selector may include dots, and matching is via startsWith().
  const cfg = parseLogLevel("*:warn origin:rpc.mirror:debug", ORIGIN);
  expect(cfg.default).toBe("debug");
});

it("trace rules are retained only when they TIGHTEN the default (higher rank)", () => {
  // default = info; only stricter levels (> info) should remain: warn & error
  const cfg = parseLogLevel("*:info trace:a:verbose trace:b:debug trace:c:warn trace:d:error", ORIGIN);
  expect(cfg.default).toBe("info");
  expect(cfg.byTrace).toEqual({
    c: "warn",
    d: "error",
  });
});

it("when origin sets debug, keep only per-trace levels stricter than debug", () => {
  const cfg = parseLogLevel("*:info origin:rpc.mirror:debug trace:x:verbose trace:y:debug trace:z:warn", ORIGIN);
  // default = debug; keep only > debug (i.e., warn/error). Here only
  // 'z:warn' stays.
  expect(cfg.default).toBe("debug");
  expect(cfg.byTrace).toEqual({ z: "warn" });
});

it("when default is warn, all looser per-trace levels are dropped", () => {
  const cfg = parseLogLevel("*:warn trace:v:verbose trace:d:debug trace:i:info trace:w:warn trace:e:error", ORIGIN);
  // default = warn; keep only > warn → error
  expect(cfg.default).toBe("warn");
  expect(cfg.byTrace).toEqual({ e: "error" });
});

it("ignores extra whitespace between tokens", () => {
  const cfg = parseLogLevel("   *:info   origin:rpc.mirror:debug   ", ORIGIN);
  expect(cfg.default).toBe("debug");
  expect(cfg.byTrace).toEqual({});
});

it("throws on invalid wildcard token shape", () => {
  expect(() => parseLogLevel("*:extra:info", ORIGIN)).toThrow(/invalid token/i);
});

it("throws on invalid origin token shape (must be exactly 3 parts)", () => {
  expect(() => parseLogLevel("origin:rpc.mirror:extra:debug", ORIGIN)).toThrow(/invalid token/i);
});

it("throws on invalid trace token shape (must be exactly 3 parts)", () => {
  expect(() => parseLogLevel("trace:rpc-request:extra:debug", ORIGIN)).toThrow(/invalid token/i);
});

it("throws on invalid level identifier", () => {
  expect(() => parseLogLevel("*:nope", ORIGIN)).toThrow(/logLevel/i);
  expect(() => parseLogLevel("origin:rpc.mirror:nah", ORIGIN)).toThrow(/logLevel/i);
  expect(() => parseLogLevel("trace:flow-1:bad", ORIGIN)).toThrow(/logLevel/i);
});
