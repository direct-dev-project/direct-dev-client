import { describe, it, expect, beforeEach } from "vitest";

import type { Checkpoint } from "@direct.dev/checkpoint";
import { check } from "@direct.dev/checkpoint";

import type { InstrumentEntry } from "../instrument._base.js";
import { PulseInstrument } from "../instrument._base.js";
import type { GaugeDataPoint, MetricAttributesSchema, PulseSpan } from "../typings.js";

type AttrsA = { method: Checkpoint<string> };
type AttrsB = { method: Checkpoint<string>; providerId: Checkpoint<string | null | undefined> };

let counterA: ProbeInstrument<AttrsA>;
let counterB: ProbeInstrument<AttrsB>;

beforeEach(() => {
  counterA = new ProbeInstrument<AttrsA>(
    "rpc_request_count",
    { unit: "1" },
    {
      method: check.str,
    },
  );

  counterB = new ProbeInstrument<AttrsB>(
    "rpc_error_count",
    { unit: "1" },
    {
      method: check.str,
      providerId: check.optional(check.str),
    },
  );
});

describe("attribute/value records", () => {
  it("rejects wrong attribute type (throws)", () => {
    // @ts-expect-error wrong type on 'method'
    expect(() => counterA.record(undefined, { method: 123 }, true)).toThrow();
    // still empty after failed record
    expect(counterA.flush().collected).toEqual([]);
  });

  it("accepts optional attributes when present and correct", () => {
    counterB.record(undefined, { method: "eth_call", providerId: "p1" }, 2);
    counterB.record(undefined, { method: "eth_call", providerId: undefined }, 1);

    const out = normalize(counterB.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]]);
    expect(out).toEqual(
      normalize([
        {
          type: "gauge",
          name: "rpc_error_count",
          unit: "1",
          value: 2,
          attrs: { method: "eth_call", providerId: "p1" },
          exemplars: [],
        },
        {
          type: "gauge",
          name: "rpc_error_count",
          unit: "1",
          value: 1,
          attrs: { method: "eth_call" },
          exemplars: [],
        },
      ]),
    );
  });

  it("appends a <name>_dropped metric when LRU evictions occur", () => {
    // capacity = 1 → evict on second distinct attrs
    const small = new ProbeInstrument<AttrsA>(
      "rpc_small",
      { unit: "1", capacity: 1, exemplars: { strategy: "ring", capacity: 3 } },
      { method: check.str },
    );

    small.record(makeTrace("a"), { method: "A" }, 10);
    small.record(makeTrace("b"), { method: "B" }, 20); // evict one series

    const { collected, dropped } = small.flush();

    // One normal datapoint + one dropped counter
    expect(collected.length).toBe(1);
    expect(dropped).not.toBe(undefined);

    expect(dropped?.value).toBe(1);
    expect(dropped?.exemplars).toEqual([]);

    // whichever series remained should have its exemplars for the records it
    // saw
    expect(collected[0]?.exemplars.length).toBeGreaterThan(0);
  });
});

describe("exemplar records", () => {
  it("collects exemplars when trace is provided and flushes them", () => {
    counterA.record(makeTrace("1"), { method: "m" }, 1);
    counterA.record(makeTrace("2"), { method: "m" }, 2);

    const out = counterA.flush().collected as [GaugeDataPoint];

    // exemplars are present and correspond to traces
    expect(out[0].exemplars).toBeDefined();
    expect(out[0].exemplars.length).toBeGreaterThan(0);

    const traceIds = new Set(out[0].exemplars.map((e) => e.span.traceId));
    expect(traceIds.has("trace-1")).toBe(true);
    expect(traceIds.has("trace-2")).toBe(true);

    // second flush is empty (state + exemplars cleared)
    expect(counterA.flush().collected).toEqual([]);
  });

  it("caps exemplars per series according to ring capacity", () => {
    // Smaller exemplar capacity to make behavior crisp
    const capped = new ProbeInstrument<AttrsA>(
      "rpc_req_count_cap",
      { unit: "1", capacity: 50, exemplars: { strategy: "ring", capacity: 2 } },
      { method: check.str },
    );

    capped.record(makeTrace("a"), { method: "m" }, 1);
    capped.record(makeTrace("b"), { method: "m" }, 2);
    capped.record(makeTrace("c"), { method: "m" }, 3); // should evict the oldest in ring

    const out = capped.flush().collected as [GaugeDataPoint];
    expect(out[0].exemplars).toBeDefined();
    expect(out[0].exemplars.length).toBe(2);

    const traceIDs = new Set(out[0].exemplars.map((e) => e.span.traceId));

    // we expect only the last two of a/b/c to remain
    expect(traceIDs.has("trace-b")).toBe(true);
    expect(traceIDs.has("trace-c")).toBe(true);
  });

  it("keeps exemplars isolated per attribute set", () => {
    counterA.record(makeTrace("x1"), { method: "m1" }, 1);
    counterA.record(makeTrace("x2"), { method: "m1" }, 2);
    counterA.record(makeTrace("y1"), { method: "m2" }, 3);

    const out = counterA.flush().collected as GaugeDataPoint[];
    // find per-attr datapoints
    const m1 = out.find((it) => it.attrs["method"] === "m1");
    const m2 = out.find((it) => it.attrs["method"] === "m2");

    expect(m1?.exemplars.map((e) => e.span.traceId)).toEqual(expect.arrayContaining(["trace-x1", "trace-x2"]));
    expect(m2?.exemplars.map((e) => e.span.traceId)).toEqual(expect.arrayContaining(["trace-y1"]));
  });
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

// Utility to create traces
function makeTrace(id: string): PulseSpan {
  return {
    traceId: `trace-${id}`,
    traceName: "trace",
    traceSampled: true,
    parentSpanId: undefined,
    parentLink: undefined,
    spanId: `span-${id}`,
    spanKind: "INTERNAL",
  };
}

/**
 * A minimal probe instrument to test PulseInstrument's attribute codec
 * behavior.
 */
class ProbeInstrument<const TAttrs extends MetricAttributesSchema> extends PulseInstrument<TAttrs, number> {
  readonly type = "gauge";

  protected accumulateValue(entry: InstrumentEntry<number | undefined>, value: number) {
    entry.value = value;
    return undefined;
  }

  exportValue(value: number): Omit<GaugeDataPoint, "type" | "name" | "unit" | "attrs" | "exemplars"> {
    return {
      value,
    };
  }
}
