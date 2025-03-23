const types = ["string", "number", "boolean", "null", "undefined"] as const;

const typeCharCodes = Object.fromEntries(types.map((type, index) => [type, 50 + index])) as Record<
  (typeof types)[number],
  number
>;

const typeChars = Object.fromEntries(types.map((type, index) => [type, String.fromCharCode(50 + index)])) as Record<
  (typeof types)[number],
  string
>;

/**
 * blazingly fast utility functions to serialize primitive input types to Wire
 * encoding for small payload sizes and fast decoding.
 */
export const pack = {
  str(input: string): string {
    return input.length + ":" + input;
  },

  nullableStr(input: string | null | undefined): string {
    return input == null
      ? input === null
        ? typeChars.null
        : typeChars.undefined
      : typeChars.string + input.length + ":" + input;
  },

  strOrNum(input: string | number): string {
    if (typeof input === "string") {
      return typeChars.string + input.length + ":" + input;
    }

    const str = input.toString();
    return typeChars.number + str.length + ":" + str;
  },

  num(input: number): string {
    const str = input.toString();
    return str.length + ":" + str;
  },

  bool(input: boolean): string {
    return input ? "1" : "0";
  },

  primitive(input: string | number | boolean | null | undefined) {
    if (input == null) {
      return input === null ? typeChars.null : typeChars.undefined;
    }

    if (typeof input === "string") {
      return typeChars.string + input.length + ":" + input;
    }

    if (typeof input === "number") {
      const str = input.toString();
      return typeChars.number + str.length + ":" + str;
    }

    return typeChars.boolean + (input ? "1" : "0");
  },

  arr<T>(input: T[], pack: (item: T) => string): string {
    let result = input.length + ":";

    for (const str of input) {
      result += pack(str);
    }

    return result;
  },
};

/**
 * blazingly fast utility functions to deserialize content in the Wire encoding
 * protocol.
 */
export const unpack = {
  str(input: string, cursor: number): [string, number] {
    // low-level optimized method to extract the length of the string,
    // incrementing the cursor as long as we're encountering numeric characters
    // (0-9)
    let len = 0;
    while (input.charCodeAt(cursor) >= 48 && input.charCodeAt(cursor) <= 57) {
      len = len * 10 + (input.charCodeAt(cursor) - 48);
      cursor++;
    }

    // extract the string following the delimeter offset
    return [input.slice(++cursor, cursor + len), cursor + len];
  },

  nullableStr(input: string, cursor: number): [string | null | undefined, number] {
    const typeCharCode = input.charCodeAt(cursor);

    if (typeCharCode === typeCharCodes.string) {
      return unpack.str(input, cursor + 1);
    }

    return [typeCharCode === typeCharCodes.null ? null : undefined, cursor + 1];
  },

  strOrNum(input: string, cursor: number): [string | number, number] {
    return input.charCodeAt(cursor) === typeCharCodes.string
      ? unpack.str(input, cursor + 1)
      : unpack.num(input, cursor + 1);
  },

  num(input: string, cursor: number): [number, number] {
    // same as str above
    let len = 0;
    while (input.charCodeAt(cursor) >= 48 && input.charCodeAt(cursor) <= 57) {
      len = len * 10 + (input.charCodeAt(cursor) - 48);
      cursor++;
    }

    // parse the number by slicing the string based on input length
    return [parseFloat(input.slice(++cursor, cursor + len)), cursor + len];
  },

  bool(input: string, cursor: number): [boolean, number] {
    return [input.charCodeAt(cursor) - 48 === 1, cursor + 1];
  },

  primitive(input: string, cursor: number): [string | number | boolean | null | undefined, number] {
    const typeCharCode = input.charCodeAt(cursor);

    if (typeCharCode === typeCharCodes.string) {
      return unpack.str(input, cursor + 1);
    }

    if (typeCharCode === typeCharCodes.number) {
      return unpack.num(input, cursor + 1);
    }

    if (typeCharCode === typeCharCodes.null) {
      return [null, cursor + 1];
    }

    if (typeCharCode === typeCharCodes.undefined) {
      return [undefined, cursor + 1];
    }

    return [input.charCodeAt(cursor) - 48 === 1, cursor + 1];
  },

  arr<T>(input: string, cursor: number, unpack: (cursor: number) => [T, number]): [T[], number] {
    // low-level optimized method to extract the length of the array,
    // incrementing the cursor as long as we're encountering numeric characters
    // (0-9)
    let len = 0;
    while (input.charCodeAt(cursor) >= 48 && input.charCodeAt(cursor) <= 57) {
      len = len * 10 + (input.charCodeAt(cursor) - 48);
      cursor++;
    }

    // prepare result array with predefined length for maximum performance
    const result: T[] = new Array(len);

    // iterate over the array and extract each value
    cursor++;
    for (let i = 0; i < len; i++) {
      const value = unpack(cursor);
      result[i] = value[0];
      cursor = value[1];
    }

    return [result, cursor];
  },
};
