import { describe, it, expect } from "vitest";

import { str, strOrNum, num, bool, date, unknown } from "../checkpoint.primitives.js";

describe("str", () => {
  it("accepts a string", () => {
    expect(str("ctx", "hello")).toBe("hello");
  });

  it("rejects non-string", () => {
    expect(() => str("ctx", 123)).toThrowError("ctx must be a string");
  });
});

describe("strOrNum", () => {
  it("accepts a string", () => {
    expect(strOrNum("ctx", "hello")).toBe("hello");
  });

  it("accepts a number", () => {
    expect(strOrNum("ctx", 42)).toBe(42);
  });

  it("rejects other types", () => {
    expect(() => strOrNum("ctx", true)).toThrowError("ctx must be string or number");
  });
});

describe("num", () => {
  it("accepts a number", () => {
    expect(num("ctx", 42)).toBe(42);
  });

  it("rejects non-number", () => {
    expect(() => num("ctx", "42")).toThrowError("ctx must be a number");
  });
});

describe("bool", () => {
  it("accepts true", () => {
    expect(bool("ctx", true)).toBe(true);
  });

  it("accepts false", () => {
    expect(bool("ctx", false)).toBe(false);
  });

  it("rejects non-boolean", () => {
    expect(() => bool("ctx", "true")).toThrowError("ctx must be a boolean");
  });
});

describe("date", () => {
  it("accepts a Date instance", () => {
    const d = new Date();
    expect(date("ctx", d)).toBe(d);
  });

  it("accepts a valid date string", () => {
    const parsed = date("ctx", "2023-01-01T00:00:00Z");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.toISOString()).toBe("2023-01-01T00:00:00.000Z");
  });

  it("rejects an invalid date string", () => {
    expect(() => date("ctx", "not-a-date")).toThrowError("ctx invalid date string");
  });

  it("rejects non-date, non-string", () => {
    expect(() => date("ctx", 123)).toThrowError("ctx must be a date or date string");
  });
});

describe("unknown", () => {
  it("passes through any value", () => {
    expect(unknown("ctx", 123)).toBe(123);
    expect(unknown("ctx", "test")).toBe("test");
    expect(unknown("ctx", { foo: "bar" })).toEqual({ foo: "bar" });
  });
});
