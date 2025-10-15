import { describe, it, expect } from "vitest";

import { makeExemplarReservoir } from "../instrument._exemplars.js";
import type { MetricExemplar } from "../typings.js";

// helper to create exemplars quickly
function makeExemplar(value: number, id: Uint8Array = new Uint8Array(0)): MetricExemplar {
  return {
    span: {
      traceId: id,
      traceName: "exemplar",
      traceSampled: true,
      parentSpanId: undefined,
      parentLink: undefined,
      spanId: id,
      spanKind: "INTERNAL",
    },
    timestamp: Date.now(),
    value,
  };
}

describe("makeExemplarReservoir", () => {
  it("creates reservoirs for each strategy", () => {
    const ring = makeExemplarReservoir({ strategy: "ring", capacity: 3 });
    const fm = makeExemplarReservoir({ strategy: "first-max" });
    const flm = makeExemplarReservoir({ strategy: "first-last-max" });

    // basic smoke: add+flush work
    ring.add(undefined, makeExemplar(1));
    fm.add(undefined, makeExemplar(1));
    flm.add(undefined, makeExemplar(1));

    expect(ring.flush()).toHaveLength(1);
    expect(fm.flush()).toHaveLength(2); // first & max
    expect(flm.flush()).toHaveLength(3); // first, last, max
  });
});

describe("ring strategy", () => {
  it("keeps at most `capacity` exemplars per bucket (ring overwrite)", () => {
    const r = makeExemplarReservoir({ strategy: "ring", capacity: 2 });
    // bucket 0
    r.add(0, makeExemplar(1));
    r.add(0, makeExemplar(2));
    r.add(0, makeExemplar(3)); // overwrites oldest

    const out = r.flush();
    // It should contain 2 exemplars from the last three writes to bucket 0
    expect(out).toHaveLength(2);
    const values = out.map((e) => e.value).sort((a, b) => Number(a) - Number(b));
    expect(values).toEqual([2, 3]);

    // second flush is empty (state cleared)
    expect(r.flush()).toEqual([]);
  });

  it("isolates buckets: capacity enforced per bucket", () => {
    const r = makeExemplarReservoir({ strategy: "ring", capacity: 2 });

    // bucket 0: push 3 values → keep last two
    r.add(0, makeExemplar(10));
    r.add(0, makeExemplar(11));
    r.add(0, makeExemplar(12));

    // bucket 1: only 1 value
    r.add(1, makeExemplar(20));

    const out = r.flush();
    expect(out).toHaveLength(3);

    const b0 = out.filter((e) => e.value >= 10 && e.value < 20).map((e) => e.value);
    const b1 = out.filter((e) => e.value >= 20 && e.value < 30).map((e) => e.value);

    expect(b0.sort((a, b) => Number(a) - Number(b))).toEqual([11, 12]);
    expect(b1).toEqual([20]);
  });

  it("returns the same exemplar object references that were added (no cloning)", () => {
    const r = makeExemplarReservoir({ strategy: "ring", capacity: 3 });
    const e1 = makeExemplar(1);
    const e2 = makeExemplar(2);
    r.add(undefined, e1);
    r.add(undefined, e2);

    const out = r.flush();
    expect(out).toContain(e1);
    expect(out).toContain(e2);
  });
});

describe("first-max strategy", () => {
  it("keeps first and max per bucket", () => {
    const r = makeExemplarReservoir({ strategy: "first-max" });

    // bucket 0 sequence: first=15, max evolves to 19
    r.add(0, makeExemplar(15)); // first=15, max=15
    r.add(0, makeExemplar(13)); // first=15, max=15
    r.add(0, makeExemplar(19)); // first=15, max=19
    r.add(0, makeExemplar(17)); // first=15, max=19

    // bucket 1 sequence: first=21, max=24
    r.add(1, makeExemplar(21));
    r.add(1, makeExemplar(24));
    r.add(1, makeExemplar(22));

    const out = r.flush();
    // there should be 2 per bucket
    const b0 = out
      .filter((e) => e.value >= 10 && e.value < 20)
      .map((e) => e.value)
      .sort((a, b) => Number(a) - Number(b));
    const b1 = out
      .filter((e) => e.value >= 20 && e.value < 30)
      .map((e) => e.value)
      .sort((a, b) => Number(a) - Number(b));

    expect(b0).toEqual([15, 19]); // first, max
    expect(b1).toEqual([21, 24]); // first, max
  });

  it("flush clears state", () => {
    const r = makeExemplarReservoir({ strategy: "first-max" });
    r.add(undefined, makeExemplar(1));

    expect(r.flush()).toHaveLength(2);
    expect(r.flush()).toEqual([]);
  });
});

describe("first-last-max strategy", () => {
  it("keeps first, last, and max per bucket", () => {
    const r = makeExemplarReservoir({ strategy: "first-last-max" });

    // bucket 0: first=12, last=18 (final), max=19
    r.add(0, makeExemplar(12)); // first=12, last=12, max=12
    r.add(0, makeExemplar(15)); // last=15, max=15
    r.add(0, makeExemplar(19)); // last=19, max=19
    r.add(0, makeExemplar(18)); // last=18, max=19

    // bucket 1: first=21, last=24, max=24
    r.add(1, makeExemplar(21));
    r.add(1, makeExemplar(24));

    const out = r.flush();
    const b0 = out
      .filter((e) => e.value >= 10 && e.value < 20)
      .map((e) => e.value)
      .sort((a, b) => Number(a) - Number(b));
    const b1 = out
      .filter((e) => e.value >= 20 && e.value < 30)
      .map((e) => e.value)
      .sort((a, b) => Number(a) - Number(b));

    expect(b0).toEqual([12, 18, 19]); // first, last, max (order not guaranteed)
    expect(b1).toEqual([21, 24, 24]); // first, last, max (max==last here)
  });

  it("flush clears state", () => {
    const r = makeExemplarReservoir({ strategy: "first-last-max" });
    r.add(undefined, makeExemplar(1));

    expect(r.flush()).toHaveLength(3);
    expect(r.flush()).toEqual([]);
  });
});
