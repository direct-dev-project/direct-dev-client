import { describe, it, expect } from "vitest";

import { shape, arr, optional, union } from "../checkpoint.composites.js";
import { str, num, bool } from "../checkpoint.primitives.js";

describe("shape", () => {
  it("validates an object matching the schema", () => {
    const cp = shape({
      name: str,
      age: num,
      active: bool,
    });

    const result = cp("user", { name: "Alice", age: 30, active: true });
    expect(result).toEqual({ name: "Alice", age: 30, active: true });
  });

  it("throws if value is not a record", () => {
    const cp = shape({ name: str });
    expect(() => cp("user", null)).toThrowError("user must be a record");
    expect(() => cp("user", "not-an-object")).toThrowError("user must be a record");
  });

  it("throws with nested context if field fails", () => {
    const cp = shape({ name: str, age: num });
    expect(() => cp("user", { name: "Bob", age: "not-a-number" })).toThrowError("user.age must be a number");
  });
});

describe("arr", () => {
  it("validates an array of values", () => {
    const cp = arr(num);
    expect(cp("numbers", [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("throws if not an array", () => {
    const cp = arr(num);
    expect(() => cp("numbers", "not-an-array")).toThrowError("numbers must be an array");
  });

  it("throws if element fails validation", () => {
    const cp = arr(num);
    expect(() => cp("numbers", [1, "oops", 3])).toThrowError("numbers[1] must be a number");
  });

  it("respects minLength", () => {
    const cp = arr(num, { minLength: 2 });
    expect(() => cp("numbers", [1])).toThrowError("numbers must contain at least 2 items");
  });

  it("respects maxLength", () => {
    const cp = arr(num, { maxLength: 2 });
    expect(() => cp("numbers", [1, 2, 3])).toThrowError("numbers must contain at most 2 items");
  });
});

describe("optional", () => {
  it("passes through null and undefined", () => {
    const cp = optional(num);
    expect(cp("age", null)).toBeNull();
    expect(cp("age", undefined)).toBeUndefined();
  });

  it("validates non-null values", () => {
    const cp = optional(num);
    expect(cp("age", 42)).toBe(42);
  });

  it("throws if non-null value fails", () => {
    const cp = optional(num);
    expect(() => cp("age", "not-a-number")).toThrowError("age must be a number");
  });
});

describe("union", () => {
  it("accepts if first checkpoint passes", () => {
    const cp = union(str, num);
    expect(cp("value", "hello")).toBe("hello");
  });

  it("accepts if later checkpoint passes", () => {
    const cp = union(str, num);
    expect(cp("value", 123)).toBe(123);
  });

  it("throws with aggregated error messages if all fail", () => {
    const cp = union(str, num);
    expect(() => cp("value", true)).toThrowError(
      "value did not match any union type:\n" + "  - value must be a string\n" + "  - value must be a number",
    );
  });

  it("works with more than two checkpoints", () => {
    const cp = union(str, num, bool);
    expect(cp("value", true)).toBe(true);
  });
});
