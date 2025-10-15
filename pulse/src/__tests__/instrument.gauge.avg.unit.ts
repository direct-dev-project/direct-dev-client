import { it, expect, beforeEach } from "vitest";

import { check } from "@direct.dev/checkpoint";

import { PulseAvgGauge } from "../instrument.gauge.js";
import type { GaugeDataPoint } from "../typings.js";

const labels = null;
const attrs = check.shape({ method: check.str });
let gauge: PulseAvgGauge<typeof labels, typeof attrs>;

beforeEach(() => {
  gauge = new PulseAvgGauge("event_loop_lag_avg_ms", { unit: "ms" }, labels, attrs);
});

it("flush() returns [] when nothing recorded", () => {
  expect(gauge.flush().collected).toEqual([]);
});

it("emits the average of all recorded values per attribute set and clears after flush", () => {
  gauge.record(undefined, 5, { method: "eth_call" });
  gauge.record(undefined, 15, { method: "eth_call" });
  gauge.record(undefined, 10, { method: "eth_call" }); // avg = 10

  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({
    type: "gauge",
    name: "event_loop_lag_avg_ms",
    attrs: { method: "eth_call" },
    value: 10,
  });

  // cleared
  expect(gauge.flush().collected).toEqual([]);
});

it("separates independent attribute sets and averages within each", () => {
  gauge.record(undefined, 1, { method: "m1" });
  gauge.record(undefined, 3, { method: "m1" });
  gauge.record(undefined, 10, { method: "m2" });
  gauge.record(undefined, 20, { method: "m2" });

  const out = normalize(gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]]);
  expect(out).toEqual(
    normalize([
      { type: "gauge", name: "event_loop_lag_avg_ms", unit: "ms", attrs: { method: "m1" }, value: 2, exemplars: [] },
      { type: "gauge", name: "event_loop_lag_avg_ms", unit: "ms", attrs: { method: "m2" }, value: 15, exemplars: [] },
    ]),
  );
});

it("ignores non-finite values but still averages valid ones", () => {
  gauge.record(undefined, 4, { method: "m" });
  gauge.record(undefined, Number.NaN, { method: "m" });
  gauge.record(undefined, Number.POSITIVE_INFINITY, { method: "m" });
  gauge.record(undefined, 6, { method: "m" }); // avg(4,6)=5

  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBeCloseTo(5, 12);
});

it("handles zero and negative numbers in the average", () => {
  gauge.record(undefined, 0, { method: "a" });
  gauge.record(undefined, -10, { method: "a" });
  gauge.record(undefined, 10, { method: "a" }); // avg=0

  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBe(0);
});

it("window isolation: successive flushes are independent", () => {
  gauge.record(undefined, 10, { method: "x" });
  gauge.record(undefined, 20, { method: "x" });
  const first = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(first[0].value).toBe(15);

  gauge.record(undefined, 40, { method: "x" });
  gauge.record(undefined, 50, { method: "x" });
  const second = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(second[0].value).toBe(45);

  expect(gauge.flush().collected).toEqual([]);
});

it("emits floating-point averages precisely", () => {
  gauge.record(undefined, 0.1, { method: "m" });
  gauge.record(undefined, 0.3, { method: "m" }); // avg=0.2
  const out = gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]];
  expect(out[0].value).toBeCloseTo(0.2, 12);
});

it("interleaves attributes independently", () => {
  gauge.record(undefined, 1, { method: "a" });
  gauge.record(undefined, 3, { method: "a" }); // avg=2
  gauge.record(undefined, 10, { method: "b" });
  gauge.record(undefined, 20, { method: "b" }); // avg=15

  const out = normalize(gauge.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]]);
  expect(out).toEqual(
    normalize([
      { type: "gauge", name: "event_loop_lag_avg_ms", unit: "ms", attrs: { method: "a" }, value: 2, exemplars: [] },
      { type: "gauge", name: "event_loop_lag_avg_ms", unit: "ms", attrs: { method: "b" }, value: 15, exemplars: [] },
    ]),
  );
});

// helper identical to your PulseGauge test
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
