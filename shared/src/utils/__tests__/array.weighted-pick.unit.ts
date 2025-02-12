import { it, expect, vi } from "vitest";

import { weightedPick } from "../array.weighted-pick.js";

type Item = {
  weighting: number;
};

it("should pick an item based on its weighting", () => {
  const items = [
    { id: 1, weighting: 1 },
    { id: 2, weighting: 2 },
    { id: 3, weighting: 3 },
  ] as const;

  // Call the function multiple times to check for weighted randomness
  const counts = { 1: 0, 2: 0, 3: 0 };
  const trials = 1000;

  for (let i = 0; i < trials; i++) {
    const picked = weightedPick(items);
    counts[picked.id]++;
  }

  // Higher weighting items should be picked more often
  expect(counts["3"]).toBeGreaterThan(counts["2"]);
  expect(counts["2"]).toBeGreaterThan(counts["1"]);
});

it("should handle an empty array by throwing", () => {
  const emptyArray: Item[] = [];
  expect(() => weightedPick(emptyArray)).toThrowError("Direct.dev / weightedPick: set must contain at least 1 item");
});

it("should handle a single item", () => {
  const items = [{ weighting: 5 }];
  const picked = weightedPick(items);
  expect(picked).toBe(items[0]);
});

it("should use cached totalWeight for future calls", () => {
  const items = [{ weighting: 2 }, { weighting: 4 }];

  // Spy on the reduce function to check if it's being called more than once
  const reduceSpy = vi.spyOn(items, "reduce").mockImplementationOnce(() => 6);

  // Initial pick should trigger the reduce call to calculate the total weight
  weightedPick(items);

  // After that, the cache should be used, so reduce should not be called
  // again
  weightedPick(items);

  expect(reduceSpy).toHaveBeenCalledTimes(1);

  // Restore spy after test
  reduceSpy.mockRestore();
});
