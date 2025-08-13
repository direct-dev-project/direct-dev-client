import { describe, it, expect } from "vitest";

import { pack, unpack } from "../core.pack.js";

describe("str", () => {
  it("should pack + unpack strings correctly", () => {
    const input = "abcd";
    const packed = pack.str(input);

    expect(unpack.str(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack dictionary strings correctly", () => {
    const input = "latest";
    const packed = pack.str(input);

    expect(unpack.str(packed, 0)).toEqual([input, packed.length]);
    expect(packed.length).toBeLessThan(input.length);
  });

  it("should handle unpacking nested strings correctly", () => {
    const input = "abcd";
    const packed = pack.str(input);
    const prefix = "123";
    const postfix = "789";

    expect(unpack.str(prefix + packed + postfix, prefix.length)).toEqual([input, prefix.length + packed.length]);
  });

  it("should fail gracefully when given invalid input", () => {
    expect(typeof unpack.str("invalidinput", 0)[0]).toBe("string");
    expect(unpack.str("invalidinput", 0)[1]).toBeGreaterThan(0);
  });

  it("should fail gracefully if cursor is out-of-range", () => {
    const input = "abc";
    const output = unpack.str(input, 10);

    expect(typeof output[0]).toEqual("string");
    expect(output[1]).toBeGreaterThanOrEqual(input.length);
  });
});

describe("nullableStr", () => {
  it("should pack + unpack 'undefined' correctly", () => {
    const input = undefined;
    const packed = pack.nullableStr(input);

    expect(unpack.nullableStr(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack 'null' correctly", () => {
    const input = null;
    const packed = pack.nullableStr(input);

    expect(unpack.nullableStr(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack dictionary strings correctly", () => {
    const input = "latest";
    const packed = pack.nullableStr(input);

    expect(unpack.nullableStr(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack strings correctly", () => {
    const input = "abcd";
    const packed = pack.nullableStr(input);

    expect(unpack.nullableStr(packed, 0)).toEqual([input, packed.length]);
  });

  it("should handle unpacking nested values correctly", () => {
    const input = "abc";
    const packed = pack.nullableStr(input);
    const prefix = "def";
    const postfix = "xyz";

    expect(unpack.nullableStr(prefix + packed + postfix, prefix.length)).toEqual([
      input,
      prefix.length + packed.length,
    ]);
  });

  it("should fail gracefully when given invalid input", () => {
    expect(unpack.nullableStr("invalidinput", 0)[1]).toBeGreaterThan(0);
  });

  it("should fail gracefully if cursor is out-of-range", () => {
    const input = "abc";
    const output = unpack.nullableStr(input, 10);

    expect(typeof output[0]).toEqual("string");
    expect(output[1]).toBeGreaterThanOrEqual(input.length);
  });
});

describe("num", () => {
  it("should pack + unpack positive integers correctly", () => {
    const input = 1000;
    const packed = pack.num(input);

    expect(unpack.num(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack negative integers correctly", () => {
    const input = -1000;
    const packed = pack.num(input);

    expect(unpack.num(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack negative floating points correctly", () => {
    const input = 1.234;
    const packed = pack.num(input);

    expect(unpack.num(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack large numbers correctly", () => {
    const input = Date.now();
    const packed = pack.num(input);

    expect(unpack.num(packed, 0)).toEqual([input, packed.length]);
  });

  it("should handle unpacking nested numbers correctly", () => {
    const input = 1000;
    const packed = pack.num(input);
    const prefix = "abc";
    const postfix = "def";

    expect(unpack.num(prefix + packed + postfix, prefix.length)).toEqual([input, prefix.length + packed.length]);
  });

  it("should fail gracefully when given invalid input", () => {
    expect(typeof unpack.num("invalidinput", 0)[0]).toBe("number");
    expect(unpack.num("invalidinput", 0)[1]).toBeGreaterThan(0);
  });

  it("should fail gracefully if cursor is out-of-range", () => {
    const cursor = 10;
    const output = unpack.num("abc", cursor);

    expect(output[0]).toEqual(NaN);
    expect(output[1]).toBeGreaterThanOrEqual(cursor);
  });
});

describe("int", () => {
  it("should pack + unpack integers correctly", () => {
    const input = 123456;
    const packed = pack.int(input);

    expect(unpack.int(packed, 0)).toEqual([input, packed.length]);
  });

  it("should handle unpacking nested integers correctly", () => {
    const input = 123456;
    const packed = pack.int(input);
    const prefix = "abc";
    const postfix = "def";

    expect(unpack.int(prefix + packed + postfix, prefix.length)).toEqual([input, prefix.length + packed.length]);
  });

  it("should fail gracefully when given invalid input", () => {
    expect(typeof unpack.int("invalidinput", 0)[0]).toBe("number");
    expect(unpack.int("invalidinput", 0)[1]).toBeGreaterThan(0);
  });

  it("should fail gracefully if cursor is out-of-range", () => {
    const cursor = 10;
    const output = unpack.int("abc", cursor);

    expect(typeof output[0]).toBe("number");
    expect(output[1]).toBeGreaterThanOrEqual(cursor);
  });
});

describe("date", () => {
  it("should pack + unpack dates correctly", () => {
    const input = new Date();
    const packed = pack.date(input);

    expect(unpack.date(packed, 0)).toEqual([input, packed.length]);
  });

  it("should handle unpacking nested dates correctly", () => {
    const input = new Date();
    const packed = pack.date(input);
    const prefix = "abc";
    const postfix = "def";

    expect(unpack.date(prefix + packed + postfix, prefix.length)).toEqual([input, prefix.length + packed.length]);
  });

  it("should fail gracefully when given invalid input", () => {
    expect(unpack.date("invalidinput", 0)[0]).toBeInstanceOf(Date);
    expect(unpack.date("invalidinput", 0)[1]).toBeGreaterThan(0);
  });

  it("should fail gracefully if cursor is out-of-range", () => {
    const cursor = 10;
    const output = unpack.date("abc", cursor);

    expect(output[0]).toBeInstanceOf(Date);
    expect(output[1]).toBeGreaterThanOrEqual(cursor);
  });
});

describe("bool", () => {
  it("should pack + unpack 'true' correctly", () => {
    const input = true;
    const packed = pack.bool(input);

    expect(unpack.bool(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack 'false' correctly", () => {
    const input = false;
    const packed = pack.bool(input);

    expect(unpack.bool(packed, 0)).toEqual([input, packed.length]);
  });

  it("should handle unpacking nested booleans correctly", () => {
    const input = true;
    const packed = pack.bool(input);
    const prefix = "abc";
    const postfix = "def";

    expect(unpack.bool(prefix + packed + postfix, prefix.length)).toEqual([input, prefix.length + packed.length]);
  });

  it("should fail gracefully when given invalid input", () => {
    expect(typeof unpack.bool("invalidinput", 0)[0]).toBe("boolean");
    expect(unpack.bool("invalidinput", 0)[1]).toBeGreaterThan(0);
  });

  it("should fail gracefully if cursor is out-of-range", () => {
    const cursor = 10;
    const output = unpack.bool("abc", cursor);

    expect(output[0]).toEqual(false);
    expect(output[1]).toBeGreaterThanOrEqual(cursor);
  });
});

describe("primitive", () => {
  it("should pack + unpack 'undefined' correctly", () => {
    const input = undefined;
    const packed = pack.primitive(input);

    expect(unpack.primitive(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack 'null' correctly", () => {
    const input = null;
    const packed = pack.primitive(input);

    expect(unpack.primitive(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack 'true' correctly", () => {
    const input = true;
    const packed = pack.primitive(input);

    expect(unpack.primitive(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack 'false' correctly", () => {
    const input = false;
    const packed = pack.primitive(input);

    expect(unpack.primitive(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack numbers correctly", () => {
    const input = -1.23;
    const packed = pack.primitive(input);

    expect(unpack.primitive(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack dictionary strings correctly", () => {
    const input = "latest";
    const packed = pack.primitive(input);

    expect(unpack.primitive(packed, 0)).toEqual([input, packed.length]);
  });

  it("should pack + unpack strings correctly", () => {
    const input = "abcd";
    const packed = pack.primitive(input);

    expect(unpack.primitive(packed, 0)).toEqual([input, packed.length]);
  });

  it("should handle unpacking nested values correctly", () => {
    const input = true;
    const packed = pack.primitive(input);
    const prefix = "abc";
    const postfix = "def";

    expect(unpack.primitive(prefix + packed + postfix, prefix.length)).toEqual([input, prefix.length + packed.length]);
  });

  it("should fail gracefully when given invalid input", () => {
    expect(unpack.primitive("invalidinput", 0)[1]).toBeGreaterThan(0);
  });

  it("should fail gracefully if cursor is out-of-range", () => {
    const input = "abc";
    const output = unpack.primitive(input, 10);

    expect(output[1]).toBeGreaterThanOrEqual(input.length);
  });
});
