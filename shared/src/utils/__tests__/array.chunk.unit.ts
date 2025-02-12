import { it, expect } from "vitest";

import { chunkArray } from "../array.chunk.js";

it("should split an array into chunks of the given size", () => {
  expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});

it("should return an empty array when given an empty array", () => {
  expect(chunkArray([], 3)).toEqual([]);
});

it("should return the same array wrapped in an array if the size is larger than the array length", () => {
  expect(chunkArray([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
});

it("should correctly handle a batch size of 1", () => {
  expect(chunkArray([1, 2, 3, 4], 1)).toEqual([[1], [2], [3], [4]]);
});

it("should correctly handle a batch size equal to the array length", () => {
  expect(chunkArray([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
});

it("should correctly handle a single element array", () => {
  expect(chunkArray([42], 2)).toEqual([[42]]);
});
