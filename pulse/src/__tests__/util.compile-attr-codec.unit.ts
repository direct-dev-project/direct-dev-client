import { describe, it, expect } from "vitest";

import { check } from "@direct.dev/checkpoint";

import { compileAttrCodec } from "../util.compile-attr-codec.js";

const SCHEMA_SIMPLE = check.shape({
  region: check.str,
  success: check.bool,
  attempts: check.uint32,
  latency_ms: check.num,
});

describe("compileAttrCode → attribute schema", () => {
  it("round-trips attributes (string|boolean|int|double)", () => {
    const codec = compileAttrCodec("reqMetrics", null, SCHEMA_SIMPLE);

    const attrs = {
      region: "eu-west-1",
      success: true,
      attempts: 3,
      latency_ms: 42.5,
    };

    const enc = codec.serialize(null, attrs);
    expect(typeof enc).toBe("string");
    expect(enc.length).toBeGreaterThan(0);

    const dec = codec.deserialize(enc);
    expect(dec).toEqual(attrs);
  });

  it("is deterministic: same input → same encoding; any change → different encoding", () => {
    const codec = compileAttrCodec("reqMetrics", null, SCHEMA_SIMPLE);

    const base = {
      region: "eu-west-1",
      success: true,
      attempts: 3,
      latency_ms: 42.5,
    };

    const a = codec.serialize(null, base);
    const b = codec.serialize(null, { ...base }); // different object, same values
    expect(a).toBe(b);

    const c = codec.serialize(null, { ...base, attempts: 4 });
    expect(c).not.toBe(a);

    const d = codec.serialize(null, { ...base, region: "us-east-1" });
    expect(d).not.toBe(a);
  });

  it("serialize is insensitive to property insertion order of the attrs object", () => {
    const codec = compileAttrCodec("reqMetrics", null, SCHEMA_SIMPLE);

    const attrs1 = { region: "eu", success: false, attempts: 1, latency_ms: 10.0 };
    const attrs2 = { success: false, latency_ms: 10.0, attempts: 1, region: "eu" };

    const s1 = codec.serialize(null, attrs1);
    const s2 = codec.serialize(null, attrs2);

    expect(s1).toBe(s2);
    expect(codec.deserialize(s1)).toEqual(attrs1);
    expect(codec.deserialize(s2)).toEqual(attrs1);
  });

  it("validates types via checkpoint: string", () => {
    const codec = compileAttrCodec("reqMetrics", null, check.shape({ region: check.str }));
    expect(() => codec.serialize(null, { region: "ok" })).not.toThrow();
    // @ts-expect-error – intentional wrong type
    expect(() => codec.serialize(null, { region: 123 })).toThrow(/PulseInstrument\(reqMetrics\)\.region/i);
  });

  it("validates types via checkpoint: boolean", () => {
    const codec = compileAttrCodec("reqMetrics", null, check.shape({ success: check.bool }));
    expect(() => codec.serialize(null, { success: true })).not.toThrow();
    // @ts-expect-error – intentional wrong type
    expect(() => codec.serialize(null, { success: "true" })).toThrow(/PulseInstrument\(reqMetrics\)\.success/i);
  });

  it("validates types via checkpoint: int", () => {
    const codec = compileAttrCodec("reqMetrics", null, check.shape({ attempts: check.uint32 }));
    expect(() => codec.serialize(null, { attempts: 5 })).not.toThrow();
    // non-integer numbers should fail the int path if your num→pack.int
    // validator enforces integers
    expect(() => codec.serialize(null, { attempts: 3.14 })).toThrow(/PulseInstrument\(reqMetrics\)\.attempts/i);
    // @ts-expect-error – intentional wrong type
    expect(() => codec.serialize(null, { attempts: "5" })).toThrow(/PulseInstrument\(reqMetrics\)\.attempts/i);
  });

  it("validates types via checkpoint: double", () => {
    const codec = compileAttrCodec("reqMetrics", null, check.shape({ latency: check.num }));
    expect(() => codec.serialize(null, { latency: 1.23 })).not.toThrow();
    expect(() => codec.serialize(null, { latency: 10 })).not.toThrow(); // ints are valid doubles
    // @ts-expect-error – intentional wrong type
    expect(() => codec.serialize(null, { latency: "1.23" })).toThrow(/PulseInstrument\(reqMetrics\)\.latency/i);
  });
});

describe("compileAttrCodec → labels + attributes", () => {
  it("handles label-only codecs", () => {
    const codec = compileAttrCodec("reqMetrics", ["primary:ok", "primary:error"], null);

    const enc = codec.serialize("primary:ok", null);
    expect(typeof enc).toBe("string");
    expect(enc).toBe("primary:ok");

    const dec = codec.deserialize(enc);
    expect(dec).toEqual({ primary: "ok" });
  });

  it("handles empty schema (encodes to empty string; decodes to empty object)", () => {
    const codec = compileAttrCodec("empty", null, null);
    const enc = codec.serialize(null, null);
    expect(enc).toBe("");
    const dec = codec.deserialize(enc);
    expect(dec).toEqual(undefined);
  });

  it("handles combined label presets + dynamic attributes", () => {
    const codec = compileAttrCodec(
      "reqMetrics",
      ["attempt:primary outcome:ok", "attempt:failover outcome:error"],
      check.shape({
        region: check.str,
        latency_ms: check.num,
      }),
    );

    const attrs = { region: "eu-west-1", latency_ms: 42.5 };
    const enc = codec.serialize("attempt:primary outcome:ok", attrs);
    expect(typeof enc).toBe("string");
    expect(enc.length).toBeGreaterThan(0);

    const dec = codec.deserialize(enc);

    expect(dec).toMatchObject({
      attempt: "primary",
      outcome: "ok",
      region: "eu-west-1",
      latency_ms: 42.5,
    });
  });

  it("round-trips multiple labels with distinct presets correctly", () => {
    const codec = compileAttrCodec(
      "labelTest",
      ["preset:A", "preset:B"],
      check.shape({
        x: check.str,
      }),
    );

    const encA = codec.serialize("preset:A", { x: "foo" });
    const encB = codec.serialize("preset:B", { x: "foo" });

    expect(encA).not.toBe(encB);

    const decA = codec.deserialize(encA);
    const decB = codec.deserialize(encB);

    expect(decA).toMatchObject({
      preset: "A",
      x: "foo",
    });

    expect(decB).toMatchObject({
      preset: "B",
      x: "foo",
    });
  });

  it("is deterministic with labels: same label + same attrs → same encoding", () => {
    const codec = compileAttrCodec("reqMetrics", ["status:ok"], check.shape({ region: check.str }));

    const a = codec.serialize("status:ok", { region: "eu" });
    const b = codec.serialize("status:ok", { region: "eu" });

    expect(a).toBe(b);

    const c = codec.serialize("status:ok", { region: "us" });
    expect(c).not.toBe(a);
  });
});
