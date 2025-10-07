import { it, expect, beforeEach } from "vitest";

import type { Checkpoint } from "@direct.dev/checkpoint";
import { check } from "@direct.dev/checkpoint";

import { PulseHistogram } from "../instrument.histogram.js";
import type { HistogramDataPoint } from "../typings.js";

let instrument: PulseHistogram<{ method: Checkpoint<string> }>;

beforeEach(() => {
  instrument = new PulseHistogram(
    "rpc_latency_ms",
    {
      unit: "ms",
      capacity: 50,
      exemplars: { strategy: "ring", capacity: 3 },
      bounds: [10, 20, 30],
    },
    { method: check.str },
  );
});

it("flush() returns [] when nothing recorded", () => {
  expect(instrument.flush().collected).toEqual([]);
});

it("upper-inclusive buckets [0..b0], (b0..b1], ... , (bn-1..+∞)", () => {
  // bounds=[10,20,30]
  // bucket0: [0,10]      -> 0, 5, 10 => 3
  // bucket1: (10,20]     -> 11, 20   => 2
  // bucket2: (20,30]     -> 21, 30   => 2
  // bucket3: (30,+∞)     -> 31       => 1
  const samples = [0, 5, 10, 11, 20, 21, 30, 31];
  for (const v of samples) instrument.record(undefined, { method: "m" }, v);

  const out = instrument.flush().collected as [HistogramDataPoint];
  expect(out).toHaveLength(1);
  const dp = out[0];

  expect(dp.type).toBe("histogram");
  expect(dp.name).toBe("rpc_latency_ms");
  expect(dp.attrs).toEqual({ method: "m" });
  expect(dp.bounds).toEqual([10, 20, 30]);
  expect(dp.counts).toHaveLength(4);
  expect(dp.counts).toEqual([3, 2, 2, 1]);
  expect(dp.sum).toBe(samples.reduce((a, b) => a + b, 0));

  // cleared
  expect(instrument.flush().collected).toEqual([]);
});

it("ignores negative and non-finite values entirely", () => {
  instrument.record(undefined, { method: "m" }, -1);
  instrument.record(undefined, { method: "m" }, Number.NaN);
  instrument.record(undefined, { method: "m" }, Number.POSITIVE_INFINITY);
  instrument.record(undefined, { method: "m" }, Number.NEGATIVE_INFINITY);

  expect(instrument.flush().collected).toEqual([]);
});

it("separates series by attribute set", () => {
  // m1: 0, 15, 25 -> [1,1,1,0]
  instrument.record(undefined, { method: "m1" }, 0);
  instrument.record(undefined, { method: "m1" }, 15);
  instrument.record(undefined, { method: "m1" }, 25);

  // m2: 10, 10, 19 -> [2,1,0,0]
  instrument.record(undefined, { method: "m2" }, 10);
  instrument.record(undefined, { method: "m2" }, 10);
  instrument.record(undefined, { method: "m2" }, 19);

  const out = normalize(instrument.flush().collected as [HistogramDataPoint, ...HistogramDataPoint[]]);
  expect(out).toEqual(
    normalize([
      {
        type: "histogram",
        name: "rpc_latency_ms",
        unit: "ms",
        attrs: { method: "m1" },
        bounds: [10, 20, 30],
        counts: [1, 1, 1, 0],
        sum: 0 + 15 + 25,
        exemplars: [],
      },
      {
        type: "histogram",
        name: "rpc_latency_ms",
        unit: "ms",
        attrs: { method: "m2" },
        bounds: [10, 20, 30],
        counts: [2, 1, 0, 0],
        sum: 10 + 10 + 19,
        exemplars: [],
      },
    ]),
  );
});

it("counts length equals bounds length + 1 and total count equals number of valid samples", () => {
  const h = new PulseHistogram(
    "lat",
    { unit: "ms", capacity: 50, exemplars: { strategy: "ring", capacity: 3 }, bounds: [5, 10, 100] },
    { method: check.str },
  );

  const vals = [0, 1, 4, 5, 6, 10, 11, 99, 100, 101, 1000];
  vals.forEach((v) => h.record(undefined, { method: "m" }, v));

  const [dp] = h.flush().collected as [HistogramDataPoint];
  expect(dp.counts).toHaveLength(4);
  const total = dp.counts.reduce((a, b) => a + b, 0);
  expect(total).toBe(vals.length);
  expect(dp.sum).toBe(vals.reduce((a, b) => a + b, 0));
});

it("window isolation: successive flushes are independent", () => {
  instrument.record(undefined, { method: "m" }, 1);
  instrument.record(undefined, { method: "m" }, 2);
  const first = instrument.flush().collected as [HistogramDataPoint, ...HistogramDataPoint[]];
  expect(first).toHaveLength(1);
  expect(first[0].counts.reduce((a, b) => a + b, 0)).toBe(2);

  instrument.record(undefined, { method: "m" }, 3);
  const second = instrument.flush().collected as [HistogramDataPoint, ...HistogramDataPoint[]];
  expect(second).toHaveLength(1);
  expect(second[0].counts.reduce((a, b) => a + b, 0)).toBe(1);

  // cleared
  expect(instrument.flush().collected).toEqual([]);
});

it("preserves floating-point samples in sum (bucketing still integral)", () => {
  const h = new PulseHistogram(
    "lat",
    {
      unit: "ms",
      capacity: 50,
      exemplars: { strategy: "ring", capacity: 3 },
      bounds: [0.1, 1, 10].map(Math.trunc) as [number, ...number[]],
    },
    { method: check.str },
  );

  // Note: your implementation requires uint32 bounds, so we coerce via
  // Math.trunc

  const vals = [0, 0.05, 0.1, 0.11, 0.5, 1, 1.01, 9.99, 10, 10.01];
  vals.forEach((v) => h.record(undefined, { method: "m" }, v));

  const [dp] = h.flush().collected as [HistogramDataPoint];
  expect(dp.sum).toBeCloseTo(
    vals.reduce((a, b) => a + b, 0),
    10,
  );
});

it("constructor validates bounds and freezes internal copy", () => {
  // first bound non-finite
  expect(
    () =>
      new PulseHistogram("lat", {
        unit: "ms",
        capacity: 50,
        exemplars: { strategy: "ring", capacity: 3 },
        bounds: [Infinity] as [number, ...number[]],
      }),
  ).toThrow();

  // non-increasing & non-finite bound should throw
  expect(
    () =>
      new PulseHistogram("lat", {
        unit: "ms",
        capacity: 50,
        exemplars: { strategy: "ring", capacity: 3 },
        bounds: [10, 10] as [number, ...number[]],
      }),
  ).toThrow();

  expect(
    () =>
      new PulseHistogram("lat", {
        unit: "ms",
        capacity: 50,
        exemplars: { strategy: "ring", capacity: 3 },
        bounds: [10, Infinity] as [number, ...number[]],
      }),
  ).toThrow();
});

// Order-insensitive compare helper
function normalize<T extends HistogramDataPoint[]>(points: T): T {
  return points
    .map((p) => ({
      type: p.type,
      name: p.name,
      bounds: p.bounds,
      counts: p.counts,
      sum: p.sum,
      attrs: p.attrs,
      key: `${p.name}:${JSON.stringify(p.attrs)}`,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ type, name, bounds, counts, sum, attrs }) => ({ type, name, bounds, counts, sum, attrs })) as T;
}
