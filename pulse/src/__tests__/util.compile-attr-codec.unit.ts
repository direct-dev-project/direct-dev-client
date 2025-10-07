import { it, expect } from "vitest";

import { check } from "@direct.dev/checkpoint";

import type { MetricAttributesSchema } from "../typings.js";
import { compileAttrCodec } from "../util.compile-attr-codec.js";

const SCHEMA_SIMPLE = {
  region: check.str,
  success: check.bool,
  attempts: check.uint32,
  latency_ms: check.num,
} as const satisfies MetricAttributesSchema;

it("round-trips attributes (string|boolean|int|double)", () => {
  const codec = compileAttrCodec("reqMetrics", SCHEMA_SIMPLE);

  const attrs = {
    region: "eu-west-1",
    success: true,
    attempts: 3,
    latency_ms: 42.5,
  };

  const enc = codec.serialize(attrs);
  expect(typeof enc).toBe("string");
  expect(enc.length).toBeGreaterThan(0);

  const dec = codec.deserialize(enc);
  expect(dec).toEqual(attrs);
});

it("is deterministic: same input → same encoding; any change → different encoding", () => {
  const codec = compileAttrCodec("reqMetrics", SCHEMA_SIMPLE);

  const base = {
    region: "eu-west-1",
    success: true,
    attempts: 3,
    latency_ms: 42.5,
  };

  const a = codec.serialize(base);
  const b = codec.serialize({ ...base }); // different object, same values
  expect(a).toBe(b);

  const c = codec.serialize({ ...base, attempts: 4 });
  expect(c).not.toBe(a);

  const d = codec.serialize({ ...base, region: "us-east-1" });
  expect(d).not.toBe(a);
});

it("serialize is insensitive to property insertion order of the attrs object", () => {
  const codec = compileAttrCodec("reqMetrics", SCHEMA_SIMPLE);

  const attrs1 = { region: "eu", success: false, attempts: 1, latency_ms: 10.0 };
  const attrs2 = { success: false, latency_ms: 10.0, attempts: 1, region: "eu" };

  const s1 = codec.serialize(attrs1);
  const s2 = codec.serialize(attrs2);

  expect(s1).toBe(s2);
  expect(codec.deserialize(s1)).toEqual(attrs1);
  expect(codec.deserialize(s2)).toEqual(attrs1);
});

it("validates types via checkpoint: string", () => {
  const codec = compileAttrCodec("reqMetrics", { region: check.str } as const);
  expect(() => codec.serialize({ region: "ok" })).not.toThrow();
  // @ts-expect-error – intentional wrong type
  expect(() => codec.serialize({ region: 123 })).toThrow(/PulseInstrument\(reqMetrics\)\.region/i);
});

it("validates types via checkpoint: boolean", () => {
  const codec = compileAttrCodec("reqMetrics", { success: check.bool } as const);
  expect(() => codec.serialize({ success: true })).not.toThrow();
  // @ts-expect-error – intentional wrong type
  expect(() => codec.serialize({ success: "true" })).toThrow(/PulseInstrument\(reqMetrics\)\.success/i);
});

it("validates types via checkpoint: int", () => {
  const codec = compileAttrCodec("reqMetrics", { attempts: check.uint32 } as const);
  expect(() => codec.serialize({ attempts: 5 })).not.toThrow();
  // non-integer numbers should fail the int path if your num→pack.int
  // validator enforces integers
  expect(() => codec.serialize({ attempts: 3.14 })).toThrow(/PulseInstrument\(reqMetrics\)\.attempts/i);
  // @ts-expect-error – intentional wrong type
  expect(() => codec.serialize({ attempts: "5" })).toThrow(/PulseInstrument\(reqMetrics\)\.attempts/i);
});

it("validates types via checkpoint: double", () => {
  const codec = compileAttrCodec("reqMetrics", { latency: check.num } as const);
  expect(() => codec.serialize({ latency: 1.23 })).not.toThrow();
  expect(() => codec.serialize({ latency: 10 })).not.toThrow(); // ints are valid doubles
  // @ts-expect-error – intentional wrong type
  expect(() => codec.serialize({ latency: "1.23" })).toThrow(/PulseInstrument\(reqMetrics\)\.latency/i);
});

it("handles empty schema (encodes to empty string; decodes to empty object)", () => {
  const codec = compileAttrCodec("empty", {} as const);
  const enc = codec.serialize({});
  expect(enc).toBe("");
  const dec = codec.deserialize(enc);
  expect(dec).toEqual({});
});

it("decodes exactly what was encoded (cursor threading)", () => {
  const codec = compileAttrCodec("reqMetrics", {
    a: check.str,
    b: check.bool,
    c: check.uint32,
    d: check.num,
  } as const);

  const original = { a: "x", b: true, c: 7, d: 0.125 };
  const enc = codec.serialize(original);
  // Ensure decode doesn’t over/under-read (will throw if cursors drift)
  const dec = codec.deserialize(enc);
  expect(dec).toEqual(original);
});
