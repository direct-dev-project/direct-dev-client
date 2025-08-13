import { it, expect } from "vitest";

import type { HashSetChecksum } from "../hash-set.js";
import { HashSet } from "../hash-set.js";

it("initially returns empty", () => {
  const set = new HashSet();

  expect(set.toArray()).toEqual([]);
  expect(set.getHashByIndex(0)).toBeUndefined();
  expect(set.has("abc")).toBe(false);
});

it("applies a full update and returns correct checksum and delta", async () => {
  const set = new HashSet();
  const delta = await set.applyUpdate(new Set(["a", "b", "c"]));

  expect(Array.from(delta.added)).toEqual(["a", "b", "c"]);
  expect(Array.from(delta.removed)).toEqual([]);
  expect(typeof delta.checksum).toBe("string");
  expect(set.toArray()).toEqual(["a", "b", "c"]);
  expect(set.has("b")).toBe(true);
  expect(set.getHashByIndex(1)).toBe("b");
});

it("computes correct delta when updating with modified set", async () => {
  const set = new HashSet();

  await set.applyUpdate(new Set(["a", "b", "c"]));
  const second = await set.applyUpdate(new Set(["b", "c", "d"]));

  expect(Array.from(second.added)).toEqual(["d"]);
  expect(Array.from(second.removed)).toEqual(["a"]);
  expect(set.toArray()).toEqual(["b", "c", "d"]);
});

it("can apply a delta and verify integrity", async () => {
  const set = new HashSet();
  const first = await set.applyUpdate(new Set(["a", "b", "c"]));
  await set.applyUpdate(new Set(["a", "c", "d"]));

  // reset to first version
  const valid = await set.applyDelta({
    added: ["b"],
    removed: ["d"],
    checksum: first.checksum,
  });

  expect(valid).toBe(true);
  expect(set.toArray()).toEqual(["a", "b", "c"]);
});

it("rejects a delta with invalid checksum", async () => {
  const set = new HashSet();

  await set.applyUpdate(new Set(["a", "b", "c"]));

  const result = await set.applyDelta({
    added: ["x"],
    removed: ["b"],
    checksum: "deadbeef" as HashSetChecksum,
  });

  expect(result).toBe(false);
  expect(set.has("x")).toBe(false);
});

it("handles empty update correctly", async () => {
  const set = new HashSet();
  const delta = await set.applyUpdate(new Set([]));

  expect(Array.from(delta.added)).toEqual([]);
  expect(Array.from(delta.removed)).toEqual([]);
  expect(set.toArray()).toEqual([]);
});

it("handles updates with redundant data", async () => {
  const set = new HashSet();

  await set.applyUpdate(new Set(["a", "a", "b", "b"]));

  expect(set.toArray()).toEqual(["a", "b"]);
});
