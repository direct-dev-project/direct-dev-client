import { it, expect, beforeEach } from "vitest";

import { check } from "@direct.dev/checkpoint";

import { PulseCounter, PulseUpDownCounter } from "../instrument.counter.js";
import type { CounterDataPoint, UpDownCounterDataPoint } from "../typings.js";

const labels = null;
const attrs = check.shape({ method: check.str });

let counter: PulseCounter<typeof labels, typeof attrs>;

beforeEach(() => {
  counter = new PulseCounter("rpc_request_count", { unit: "1" }, labels, attrs);
});

// --- Basic semantics (unchanged) -----------------------------------------

it("flush() returns [] when nothing recorded", () => {
  expect(counter.flush().collected).toEqual([]);
});

it("does not create a new series on first zero increment (policy check)", () => {
  counter.record(undefined, 0, { method: "m1" });
  expect(counter.flush().collected).toEqual([]);
});

it("ignores negative increments", () => {
  counter.record(undefined, -1, { method: "m1" });
  expect(counter.flush().collected).toEqual([]);
});

it("allows negative increments for UpDownCounter", () => {
  const counter = new PulseUpDownCounter("rpc_request_count", { unit: "1" });
  counter.record(undefined, -1);

  const out = normalize(counter.flush().collected as [UpDownCounterDataPoint, ...UpDownCounterDataPoint[]]);
  expect(out).toEqual([
    {
      type: "up_down_counter",
      name: "rpc_request_count",
      unit: "1",
      value: -1,
      attrs: undefined,
      exemplars: [],
    },
  ]);
});

it("increments by provided value", () => {
  counter.record(undefined, 5, { method: "eth_call" });
  counter.record(undefined, 7, { method: "eth_call" });

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBe(12);

  expect(counter.flush().collected).toEqual([]); // cleared
});

it("ignores non-finite values (NaN/±Infinity)", () => {
  counter.record(undefined, 1, { method: "ok" });
  counter.record(undefined, Number.NaN, { method: "ok" });
  counter.record(undefined, Number.POSITIVE_INFINITY, { method: "ok" });
  counter.record(undefined, Number.NEGATIVE_INFINITY, { method: "ok" });

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].attrs).toEqual({ method: "ok" });
  expect(out[0].value).toBe(1);

  expect(counter.flush().collected).toEqual([]); // cleared
});

it("handles large and precise floating-point sums", () => {
  counter.record(undefined, 1e9, { method: "m" });
  counter.record(undefined, 0.1, { method: "m" });
  counter.record(undefined, 0.2, { method: "m" });

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBeCloseTo(1_000_000_000.3, 6);
});

it("handles multiple attribute keys and multiple record() calls", () => {
  counter.record(undefined, 1, { method: "m1" }); // +1
  counter.record(undefined, 4, { method: "m1" }); // +4
  counter.record(undefined, 10, { method: "m2" }); // +10
  counter.record(undefined, 0, { method: "m1" }); // +0 (no-op increment)

  const out = normalize(counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]]);
  expect(out).toEqual(
    normalize([
      {
        type: "counter",
        name: "rpc_request_count",
        unit: "1",
        value: 5,
        attrs: { method: "m1" },
        exemplars: [],
      },
      {
        type: "counter",
        name: "rpc_request_count",
        unit: "1",
        value: 10,
        attrs: { method: "m2" },
        exemplars: [],
      },
    ]),
  );

  expect(counter.flush().collected).toEqual([]); // cleared
});

it("exports independent windows across successive flushes", () => {
  counter.record(undefined, 2, { method: "m1" });
  const first = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];

  counter.record(undefined, 5, { method: "m1" });
  const second = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];

  expect(first).toHaveLength(1);
  expect(first[0].value).toBe(2);

  expect(second).toHaveLength(1);
  expect(second[0].value).toBe(5);
});

it("supports fractional (floating-point) increments", () => {
  counter.record(undefined, 0.25, { method: "m" });
  counter.record(undefined, 0.75, { method: "m" });

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBeCloseTo(1.0);
});

it("treats different key orders as the same attribute set", () => {
  const counter = new PulseCounter(
    "rpc_error_count",
    { unit: "1" },
    null,
    check.shape({
      method: check.str,
      providerId: check.optional(check.str),
    }),
  );

  // same attrs, different construction order
  counter.record(undefined, 1, { providerId: "p1", method: "eth_call" });
  counter.record(undefined, 3, { method: "eth_call", providerId: "p1" });

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].attrs).toEqual({ method: "eth_call", providerId: "p1" });
  expect(out[0].value).toBe(4);
});

// Order-insensitive compare helper
function normalize<T extends Array<CounterDataPoint | UpDownCounterDataPoint>>(points: T): T {
  return (
    points
      .map((p) => ({
        ...p,
        key: `${p.name}:${JSON.stringify(p.attrs)}`,
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ key, ...rest }) => rest) as unknown as T
  );
}
