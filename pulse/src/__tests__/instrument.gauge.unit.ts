import { it, expect, beforeEach } from "vitest";

import { check } from "@direct.dev/checkpoint";

import { PulseGauge } from "../instrument.gauge.js";
import type { GaugeDataPoint } from "../typings.js";

const labels = null;
const attrs = check.shape({ method: check.str });
let gauge: PulseGauge<typeof labels, typeof attrs>;

beforeEach(() => {
  gauge = new PulseGauge("rpc_inflight_requests", { unit: "1" }, labels, attrs);
});

it("flush() returns [] when nothing recorded", () => {
  expect(gauge.flush().collected).toEqual([]);
});

it("emits the last recorded value per attribute set and clears after flush", () => {
  gauge.record(undefined, 1, { method: "eth_call" });
  gauge.record(undefined, 2, { method: "eth_call" }); // last one wins

  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({
    type: "gauge",
    name: "rpc_inflight_requests",
    attrs: { method: "eth_call" },
    value: 2,
  });

  // cleared
  expect(gauge.flush().collected).toEqual([]);
});

it("separates values by distinct attribute sets within a window", () => {
  gauge.record(undefined, 5, { method: "m1" });
  gauge.record(undefined, 10, { method: "m2" });

  const out = normalize(gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]]);
  expect(out).toEqual(
    normalize([
      { type: "gauge", name: "rpc_inflight_requests", unit: "1", attrs: { method: "m1" }, value: 5, exemplars: [] },
      { type: "gauge", name: "rpc_inflight_requests", unit: "1", attrs: { method: "m2" }, value: 10, exemplars: [] },
    ]),
  );

  // cleared
  expect(gauge.flush().collected).toEqual([]);
});

it("overwrites earlier values per attribute before flush (last wins)", () => {
  gauge.record(undefined, 3, { method: "m" });
  gauge.record(undefined, 7, { method: "m" });
  gauge.record(undefined, 11, { method: "m" });

  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].attrs).toEqual({ method: "m" });
  expect(out[0].value).toBe(11);
});

it("window isolation: successive flushes are independent", () => {
  gauge.record(undefined, 2, { method: "m1" });

  const first = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(first).toHaveLength(1);
  expect(first[0].value).toBe(2);

  // new window
  gauge.record(undefined, 5, { method: "m1" });

  const second = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(second).toHaveLength(1);
  expect(second[0].value).toBe(5);

  // double flush yields empty on second call
  expect(gauge.flush().collected).toEqual([]);
});

it("updates after a flush only affect the next flush", () => {
  gauge.record(undefined, 10, { method: "m" });
  const before = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];

  gauge.record(undefined, 42, { method: "m" });
  const after = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];

  expect(before).toHaveLength(1);
  expect(before[0].value).toBe(10);

  expect(after).toHaveLength(1);
  expect(after[0].value).toBe(42);
});

it("ignores non-finite values (NaN, +∞, -∞) and keeps prior finite value within the window", () => {
  gauge.record(undefined, 8, { method: "m" });

  // non-finite updates are ignored
  gauge.record(undefined, Number.NaN, { method: "m" });
  gauge.record(undefined, Number.POSITIVE_INFINITY, { method: "m" });
  gauge.record(undefined, Number.NEGATIVE_INFINITY, { method: "m" });

  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].attrs).toEqual({ method: "m" });
  expect(out[0].value).toBe(8);

  // cleared
  expect(gauge.flush().collected).toEqual([]);
});

it("allows zero and negative finite values", () => {
  gauge.record(undefined, 0, { method: "zero" });
  gauge.record(undefined, -3, { method: "neg" });

  const out = normalize(gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]]);
  expect(out).toEqual(
    normalize([
      { type: "gauge", name: "rpc_inflight_requests", unit: "1", attrs: { method: "zero" }, value: 0, exemplars: [] },
      { type: "gauge", name: "rpc_inflight_requests", unit: "1", attrs: { method: "neg" }, value: -3, exemplars: [] },
    ]),
  );
});

it("preserves floating-point precision (last value wins)", () => {
  gauge.record(undefined, 0.1, { method: "m" });
  gauge.record(undefined, 0.2, { method: "m" });

  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBeCloseTo(0.2, 12);
});

it("handles interleaved attributes with independent last values", () => {
  gauge.record(undefined, 1, { method: "a" });
  gauge.record(undefined, 10, { method: "b" });
  gauge.record(undefined, 2, { method: "a" }); // overwrites only 'a'
  gauge.record(undefined, 11, { method: "b" }); // overwrites only 'b'

  const out = normalize(gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]]);
  expect(out).toEqual(
    normalize([
      { type: "gauge", name: "rpc_inflight_requests", unit: "1", attrs: { method: "a" }, value: 2, exemplars: [] },
      { type: "gauge", name: "rpc_inflight_requests", unit: "1", attrs: { method: "b" }, value: 11, exemplars: [] },
    ]),
  );
});

// Order-insensitive compare helper
function normalize<T extends GaugeDataPoint[]>(points: T): T {
  return points
    .map((p) => ({
      type: p.type,
      name: p.name,
      value: p.value,
      attrs: p.attrs,
      key: `${p.name}:${JSON.stringify(p.attrs)}`,
    }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ type, name, value, attrs }) => ({ type, name, value, attrs })) as T;
}
