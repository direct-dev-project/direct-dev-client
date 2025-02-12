import { it, expect } from "vitest";

import { makeAsyncGeneratorFromEmitter } from "../async.generator-from-emitter.js";
import { asyncTimeout } from "../async.timeout.js";

it("should correctly yield synchronous values", async () => {
  const result: number[] = [];

  for await (const value of makeAsyncGeneratorFromEmitter<number>(async (emit) => {
    emit(1);
    emit(2);
    emit(3);
    emit(4);
  })) {
    result.push(value);
  }

  expect(result).toEqual([1, 2, 3, 4]);
});

it("should correctly yield asynchroneous values", async () => {
  const result: number[] = [];

  for await (const value of makeAsyncGeneratorFromEmitter<number>(async (emit) => {
    await asyncTimeout(1);
    emit(1);
    await asyncTimeout(1);
    emit(2);
    await asyncTimeout(1);
    emit(3);
    await asyncTimeout(1);
    emit(4);
  })) {
    result.push(value);
  }

  expect(result).toEqual([1, 2, 3, 4]);
});

it("should propagate runtime exceptions from inside the callback", async () => {
  const iterator = makeAsyncGeneratorFromEmitter<number>(async (emit) => {
    emit(1);
    await asyncTimeout(1);
    emit(2);
    throw new Error("boom!");
  });

  const items: number[] = [];
  let result: IteratorResult<number, void>;
  let reason: unknown;

  try {
    while (!(result = await iterator.next()).done) {
      items.push(result.value);
    }
  } catch (error) {
    reason = error;
  }

  // essentially verify that we can
  expect(items).toEqual([1, 2]);
  expect(reason).toMatchObject(new Error("boom!"));
});
