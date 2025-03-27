import { it, expect } from "vitest";

import { PushableAsyncGenerator } from "../async.pushable-generator.js";

it("should yield values in the correct order", async () => {
  const gen = new PushableAsyncGenerator<number>();

  gen.push(1);
  gen.push(2);
  gen.push(3);
  gen.close(null);

  const result: number[] = [];

  for await (const value of gen) {
    result.push(value);
  }

  expect(result).toEqual([1, 2, 3]);
});

it("should resolve to an empty array if no values were pushed", async () => {
  const gen = new PushableAsyncGenerator<number>();

  gen.close(null);
  const result = await gen.toArray();

  expect(result).toEqual([]);
});

it("should resolve to an array with pushed values", async () => {
  const gen = new PushableAsyncGenerator<number>();

  gen.push(1);
  gen.push(2);
  gen.push(3);
  gen.close(null);

  const result = await gen.toArray();

  expect(result).toEqual([1, 2, 3]);
});

it("should correctly report size before and after closing", async () => {
  const gen = new PushableAsyncGenerator<number>();

  expect(gen.size).toBe(0);

  gen.push(10);
  gen.push(20);

  expect(gen.size).toBe(2);

  gen.close(null);
  expect(gen.size).toBe(2);
});

it("should close properly and prevent further pushing", async () => {
  const gen = new PushableAsyncGenerator<number>();

  gen.push(1);
  gen.push(2);
  gen.close(null);

  await expect(() => gen.push(3)).toThrowError("PushableAsyncGenerator.push(): Generator is already closed");
});

it("should return immediately when closed", async () => {
  const gen = new PushableAsyncGenerator<number>();

  gen.close(null);

  const result = await gen.next();
  expect(result.done).toBe(true);
});

it("should handle errors thrown inside the generator", async () => {
  const gen = new PushableAsyncGenerator<number>();

  const errorMessage = "Test error";
  await expect(() => gen.throw(new Error(errorMessage))).rejects.toThrow(errorMessage);
});

it("should not allow multiple closes", async () => {
  const gen = new PushableAsyncGenerator<number>();

  gen.close(null);

  await expect(() => gen.close(null)).rejects.toThrow("PushableAsyncGenerator.close(): Generator is already closed");
});

it("should work with Symbol.asyncIterator", async () => {
  const gen = new PushableAsyncGenerator<number>();

  expect(typeof gen[Symbol.asyncIterator]).toBe("function");
  expect(gen[Symbol.asyncIterator]()).toBe(gen);
});
