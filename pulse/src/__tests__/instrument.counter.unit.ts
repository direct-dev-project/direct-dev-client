import { it, expect, beforeEach } from "vitest";

import type { Checkpoint } from "@direct.dev/checkpoint";
import { check } from "@direct.dev/checkpoint";

import { PulseCounter, PulseUpDownCounter } from "../instrument.counter.js";
import type { CounterDataPoint, UpDownCounterDataPoint } from "../typings.js";

let counter: PulseCounter<{
  method: Checkpoint<string>;
}>;

beforeEach(() => {
  counter = new PulseCounter("rpc_request_count", { unit: "1" }, { method: check.str });
});

// --- Basic semantics (unchanged) -----------------------------------------

it("flush() returns [] when nothing recorded", () => {
  expect(counter.flush().collected).toEqual([]);
});

it("does not create a new series on first zero increment (policy check)", () => {
  counter.record(undefined, { method: "m1" }, 0);
  expect(counter.flush().collected).toEqual([]);
});

it("ignores negative increments", () => {
  counter.record(undefined, { method: "m1" }, -1);
  expect(counter.flush().collected).toEqual([]);
});

it("allows negative increments for UpDownCounter", () => {
  const counter = new PulseUpDownCounter("rpc_request_count", { unit: "1" });
  counter.record(undefined, {}, -1);

  const out = normalize(counter.flush().collected as [UpDownCounterDataPoint, ...UpDownCounterDataPoint[]]);
  expect(out).toEqual([
    {
      type: "up_down_counter",
      name: "rpc_request_count",
      unit: "1",
      value: -1,
      attrs: {},
      exemplars: [],
    },
  ]);
});

it("increments by provided value", () => {
  counter.record(undefined, { method: "eth_call" }, 5);
  counter.record(undefined, { method: "eth_call" }, 7);

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBe(12);

  expect(counter.flush().collected).toEqual([]); // cleared
});

it("ignores non-finite values (NaN/±Infinity)", () => {
  counter.record(undefined, { method: "ok" }, 1);
  counter.record(undefined, { method: "ok" }, Number.NaN);
  counter.record(undefined, { method: "ok" }, Number.POSITIVE_INFINITY);
  counter.record(undefined, { method: "ok" }, Number.NEGATIVE_INFINITY);

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].attrs).toEqual({ method: "ok" });
  expect(out[0].value).toBe(1);

  expect(counter.flush().collected).toEqual([]); // cleared
});

it("handles large and precise floating-point sums", () => {
  counter.record(undefined, { method: "m" }, 1e9);
  counter.record(undefined, { method: "m" }, 0.1);
  counter.record(undefined, { method: "m" }, 0.2);

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBeCloseTo(1_000_000_000.3, 6);
});

it("handles multiple attribute keys and multiple record() calls", () => {
  counter.record(undefined, { method: "m1" }, 1); // +1
  counter.record(undefined, { method: "m1" }, 4); // +4
  counter.record(undefined, { method: "m2" }, 10); // +10
  counter.record(undefined, { method: "m1" }, 0); // +0 (no-op increment)

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
  counter.record(undefined, { method: "m1" }, 2);
  const first = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];

  counter.record(undefined, { method: "m1" }, 5);
  const second = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];

  expect(first).toHaveLength(1);
  expect(first[0].value).toBe(2);

  expect(second).toHaveLength(1);
  expect(second[0].value).toBe(5);
});

it("supports fractional (floating-point) increments", () => {
  counter.record(undefined, { method: "m" }, 0.25);
  counter.record(undefined, { method: "m" }, 0.75);

  const out = counter.flush().collected as [CounterDataPoint, ...CounterDataPoint[]];
  expect(out).toHaveLength(1);
  expect(out[0].value).toBeCloseTo(1.0);
});

it("treats different key orders as the same attribute set", () => {
  const counter = new PulseCounter(
    "rpc_error_count",
    { unit: "1" },
    {
      method: check.str,
      providerId: check.optional(check.str),
    },
  );

  // same attrs, different construction order
  counter.record(undefined, { providerId: "p1", method: "eth_call" }, 1);
  counter.record(undefined, { method: "eth_call", providerId: "p1" }, 3);

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
