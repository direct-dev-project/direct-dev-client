import { describe, it, expect } from "vitest";

import { literal, typedStr } from "../checkpoint.extras.js";

describe("literal", () => {
  it("accepts a matching literal string", () => {
    const cp = literal("foo", "bar");
    expect(cp("ctx", "foo")).toBe("foo");
    expect(cp("ctx", "bar")).toBe("bar");
  });

  it("accepts a matching literal number", () => {
    const cp = literal(1, 2);
    expect(cp("ctx", 1)).toBe(1);
    expect(cp("ctx", 2)).toBe(2);
  });

  it("accepts a matching literal boolean", () => {
    const cp = literal(true, false);
    expect(cp("ctx", true)).toBe(true);
    expect(cp("ctx", false)).toBe(false);
  });

  it("rejects non-matching values", () => {
    const cp = literal("foo", "bar");
    expect(() => cp("ctx", "baz")).toThrowError('ctx must be ["foo","bar"]');
  });
});

describe("typedStr", () => {
  it("accepts and returns a string", () => {
    const cp = typedStr<"hello">();
    const val = cp("ctx", "hello");
    expect(val).toBe("hello");
  });

  it("rejects non-string values", () => {
    const cp = typedStr<"hello">();
    expect(() => cp("ctx", 123)).toThrowError("ctx must be a string");
  });
});
