import { describe, it, expect, beforeEach } from "vitest";

import { check } from "@direct.dev/checkpoint";

import type { InstrumentEntry } from "../instrument._base.js";
import { PulseInstrument } from "../instrument._base.js";
import type { GaugeDataPoint, MetricAttributesSchema, PulseSpan } from "../typings.js";

const labelsA = ["attempt:primary" as const, "attempt:failover" as const];
const attrsA = check.shape({ method: check.str });

const labelsB = ["attempt:primary" as const, "attempt:failover" as const];
const attrsB = check.shape({ method: check.str, providerId: check.optional(check.str) });

let counterA: ProbeInstrument<typeof labelsA, typeof attrsA>;
let counterB: ProbeInstrument<typeof labelsB, typeof attrsB>;

beforeEach(() => {
  counterA = new ProbeInstrument("rpc_request_count", { unit: "1" }, labelsA, attrsA);
  counterB = new ProbeInstrument("rpc_error_count", { unit: "1" }, labelsB, attrsB);
});

describe("attribute/value records", () => {
  it("rejects wrong attribute type (throws)", () => {
    // @ts-expect-error wrong type on 'method'
    expect(() => counterA.record(undefined, { method: 123 }, true)).toThrow();
    // still empty after failed record
    expect(counterA.flush().collected).toEqual([]);
  });

  it("accepts optional attributes when present and correct", () => {
    counterB.record(undefined, 2, "attempt:primary", { method: "eth_call", providerId: "p1" });
    counterB.record(undefined, 1, "attempt:failover", { method: "eth_call", providerId: undefined });

    const out = normalize(counterB.flush().collected as [GaugeDataPoint, ...GaugeDataPoint[]]);
    expect(out).toEqual(
      normalize([
        {
          type: "gauge",
          name: "rpc_error_count",
          unit: "1",
          value: 2,
          attrs: { attempt: "primary", method: "eth_call", providerId: "p1" },
          exemplars: [],
        },
        {
          type: "gauge",
          name: "rpc_error_count",
          unit: "1",
          value: 1,
          attrs: { attempt: "failover", method: "eth_call", providerId: undefined },
          exemplars: [],
        },
      ]),
    );
  });

  it("appends a <name>_dropped metric when LRU evictions occur", () => {
    // capacity = 1 → evict on second distinct attrs
    const small = new ProbeInstrument(
      "rpc_small",
      { unit: "1", capacity: 1, exemplars: { strategy: "ring", capacity: 3 } },
      labelsA,
      attrsA,
    );

    small.record(makeTrace(new Uint8Array(0)), 10, "attempt:primary", { method: "A" });
    small.record(makeTrace(new Uint8Array(0)), 20, "attempt:primary", { method: "B" }); // evict one series

    const { collected, dropped } = small.flush();

    // One normal datapoint + one dropped counter
    expect(collected.length).toBe(1);
    expect(dropped).not.toBe(undefined);

    expect(dropped?.[0].value).toBe(1);
    expect(dropped?.[0].exemplars).toEqual([]);

    // whichever series remained should have its exemplars for the records it
    // saw
    expect(collected[0]?.exemplars.length).toBeGreaterThan(0);
  });
});

describe("exemplar records", () => {
  it("collects exemplars when trace is provided and flushes them", () => {
    const trace1Id = new Uint8Array(0);
    const trace2Id = new Uint8Array(0);

    counterA.record(makeTrace(trace1Id), 1, "attempt:primary", { method: "m" });
    counterA.record(makeTrace(trace2Id), 2, "attempt:primary", { method: "m" });

    const out = counterA.flush().collected as [GaugeDataPoint];

    // exemplars are present and correspond to traces
    expect(out[0].exemplars).toBeDefined();
    expect(out[0].exemplars.length).toBeGreaterThan(0);

    const traceIds = new Set(out[0].exemplars.map((e) => e.span.traceId));

    expect(traceIds.has(trace1Id)).toBe(true);
    expect(traceIds.has(trace2Id)).toBe(true);

    // second flush is empty (state + exemplars cleared)
    expect(counterA.flush().collected).toEqual([]);
  });

  it("caps exemplars per series according to ring capacity", () => {
    // Smaller exemplar capacity to make behavior crisp
    const capped = new ProbeInstrument(
      "rpc_req_count_cap",
      { unit: "1", capacity: 50, exemplars: { strategy: "ring", capacity: 2 } },
      labelsA,
      attrsA,
    );

    const trace1Id = new Uint8Array(0);
    const trace2Id = new Uint8Array(0);
    const trace3Id = new Uint8Array(0);
    capped.record(makeTrace(trace1Id), 1, "attempt:primary", { method: "m" });
    capped.record(makeTrace(trace2Id), 2, "attempt:primary", { method: "m" });
    capped.record(makeTrace(trace3Id), 3, "attempt:primary", { method: "m" }); // should evict the oldest in ring

    const out = capped.flush().collected as [GaugeDataPoint];
    expect(out[0].exemplars).toBeDefined();
    expect(out[0].exemplars.length).toBe(2);

    const traceIDs = new Set(out[0].exemplars.map((e) => e.span.traceId));

    // we expect only the last two of a/b/c to remain
    expect(traceIDs.has(trace2Id)).toBe(true);
    expect(traceIDs.has(trace3Id)).toBe(true);
  });

  it("keeps exemplars isolated per attribute set", () => {
    const traceX1Id = new Uint8Array(0);
    const traceX2Id = new Uint8Array(0);
    const traceY1Id = new Uint8Array(0);
    counterA.record(makeTrace(traceX1Id), 1, "attempt:primary", { method: "m" });
    counterA.record(makeTrace(traceX2Id), 2, "attempt:primary", { method: "m" });
    counterA.record(makeTrace(traceY1Id), 3, "attempt:failover", { method: "m" });

    const out = counterA.flush().collected as GaugeDataPoint[];
    // find per-attr datapoints
    const primary = out.find((it) => it.attrs["attempt"] === "primary");
    const failover = out.find((it) => it.attrs["attempt"] === "failover");

    expect(primary?.exemplars.map((e) => e.span.traceId)).toEqual(expect.arrayContaining([traceX1Id, traceX2Id]));
    expect(failover?.exemplars.map((e) => e.span.traceId)).toEqual(expect.arrayContaining([traceY1Id]));
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
function makeTrace(id: Uint8Array): PulseSpan {
  return {
    traceId: id,
    traceName: "trace",
    traceSampled: true,
    parentSpanId: undefined,
    parentLink: undefined,
    spanId: id,
    spanKind: "INTERNAL",
  };
}

/**
 * A minimal probe instrument to test PulseInstrument's attribute codec
 * behavior.
 */
class ProbeInstrument<
  const TLabels extends string[],
  const TAttrs extends MetricAttributesSchema,
> extends PulseInstrument<TLabels, TAttrs, number> {
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
