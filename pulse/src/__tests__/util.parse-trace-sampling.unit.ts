import { it, expect } from "vitest";

import { parseTraceSampling } from "../util.parse-trace-sampling.js";

const ORIGIN = "rpc.mirror.RevalidationPlanner";

it("uses wildcard default when only *:<factor> is provided", () => {
  const cfg = parseTraceSampling("*:0.25", ORIGIN);
  expect(cfg.default).toBe(0.25);
  expect(cfg.byEvent).toEqual({});
});

it("defaults to 0 when no rules are provided", () => {
  const cfg = parseTraceSampling("", ORIGIN);
  expect(cfg.default).toBe(0);
  expect(cfg.byEvent).toEqual({});
});

it("applies matching origin over wildcard", () => {
  const cfg = parseTraceSampling("*:0.1 origin:rpc.mirror:0.75", ORIGIN);
  expect(cfg.default).toBe(0.75); // origin match overrides wildcard
  expect(cfg.byEvent).toEqual({});
});

it("ignores non-matching origin selectors", () => {
  const cfg = parseTraceSampling("*:0.1 origin:rpc.agent:0.9", ORIGIN);
  expect(cfg.default).toBe(0.1); // fallback stays wildcard
});

it("uses most-specific matching origin regardless of order (longest prefix wins)", () => {
  const cfg1 = parseTraceSampling("*:0.1 origin:rpc:0.2 origin:rpc.mirror:0.8", ORIGIN);
  const cfg2 = parseTraceSampling("*:0.1 origin:rpc.mirror:0.8 origin:rpc:0.2", ORIGIN);
  expect(cfg1.default).toBe(0.8);
  expect(cfg2.default).toBe(0.8);
});

it("for equal-specificity origin selectors, later token wins", () => {
  const cfg = parseTraceSampling("*:0.1 origin:rpc:0.3 origin:rpc:0.9", ORIGIN);
  expect(cfg.default).toBe(0.9);
});

it("origin selector treats token as a single string; dots are part of selector", () => {
  const cfg = parseTraceSampling("*:0.1 origin:rpc.mirror:0.7", ORIGIN);
  expect(cfg.default).toBe(0.7);
});

it("trace rules are retained exactly as provided", () => {
  const cfg = parseTraceSampling("*:0.1 event:a:0 event:b:0.5 event:c:1", ORIGIN);
  expect(cfg.default).toBe(0.1);
  expect(cfg.byEvent).toEqual({
    a: 0,
    b: 0.5,
    c: 1,
  });
});

it("ignores extra whitespace between tokens", () => {
  const cfg = parseTraceSampling("   *:0.1   origin:rpc.mirror:0.9   event:x:0.8  ", ORIGIN);
  expect(cfg.default).toBe(0.9);
  expect(cfg.byEvent).toEqual({ x: 0.8 });
});

it("throws on invalid wildcard token shape", () => {
  expect(() => parseTraceSampling("*:extra:0.2", ORIGIN)).toThrow(/invalid token/i);
});

it("throws on invalid origin token shape (must be exactly 3 parts)", () => {
  expect(() => parseTraceSampling("origin:rpc.mirror:extra:0.7", ORIGIN)).toThrow(/invalid token/i);
});

it("throws on invalid trace token shape (must be exactly 3 parts)", () => {
  expect(() => parseTraceSampling("event:flow-1:extra:0.9", ORIGIN)).toThrow(/invalid token/i);
});

it("throws on invalid factor value", () => {
  expect(() => parseTraceSampling("*:nope", ORIGIN)).toThrow(/invalid factor/i);
  expect(() => parseTraceSampling("*:-1", ORIGIN)).toThrow(/invalid factor/i);
  expect(() => parseTraceSampling("*:2", ORIGIN)).toThrow(/invalid factor/i);
});
