import { it, expect } from "vitest";

import { compareBlockHeights } from "../block-height.compare.js";

it("returns undefined if attempting to compare invalid block heights", async () => {
  expect(compareBlockHeights("0+0" as `0x${number}`, "0+0" as `0x${number}`)).toEqual(undefined);
  expect(compareBlockHeights("0x1", "0+0" as `0x${number}`)).toEqual(undefined);
  expect(compareBlockHeights("0+0" as `0x${number}`, "0x1")).toEqual(undefined);
  expect(compareBlockHeights("0x01", "0x01")).toEqual(undefined);
  expect(compareBlockHeights("0x01", "0x1")).toEqual(undefined);
  expect(compareBlockHeights("0x1", "0x01")).toEqual(undefined);
});

it("handles 0x0 as a special case", async () => {
  expect(compareBlockHeights("0x0", "0x1")).toEqual(-1);
});

it("handles differences in input length correctly", async () => {
  expect(compareBlockHeights("0x10", "0xA")).toEqual(1);
  expect(compareBlockHeights("0xA", "0x10")).toEqual(-1);
});

it("handles same-length comparisons correctly", async () => {
  expect(compareBlockHeights("0xABC", "0x123")).toEqual(1);
  expect(compareBlockHeights("0x123", "0x456")).toEqual(-1);
});

it("handles identical inputs correctly", async () => {
  expect(compareBlockHeights("0xABC", "0xABC")).toEqual(0);
});

it("ignores casing in inputs", () => {
  expect(compareBlockHeights("0xABC", "0xabc")).toEqual(-1);
});
