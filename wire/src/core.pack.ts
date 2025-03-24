//
// mapping of primitive types and their designated charCodes used when decoding
// union of primitive types
//
const types = ["string", "dictionary", "number", "boolean", "null", "undefined"] as const;

const typeCharCodes = Object.fromEntries(types.map((type, index) => [type, 33 + index])) as Record<
  (typeof types)[number],
  number
>;

const typeChars = Object.fromEntries(types.map((type, index) => [type, String.fromCharCode(33 + index)])) as Record<
  (typeof types)[number],
  string
>;

//
// mapping of dictionary words used to further reduce payload size by
// compression common strings into a well-known dictionary
//
const dictionaryStrings = ["latest", "eth_call", "eth_blockNumber"];

const stringToDictionaryChar = Object.fromEntries(
  dictionaryStrings.map((word, index) => [word, String.fromCharCode(33 + index)]),
);
const charCodeToDictionaryString = Object.fromEntries(dictionaryStrings.map((word, index) => [33 + index, word]));

/**
 * blazingly fast utility functions to serialize primitive input types to Wire
 * encoding for small payload sizes and fast decoding.
 */
export const pack = {
  str(input: string): string {
    const dictionaryChar = stringToDictionaryChar[input];

    return dictionaryChar == null ? input.length + ":" + input : typeChars.dictionary + dictionaryChar;
  },

  nullableStr(input: string | null | undefined): string {
    if (input == null) {
      return input === null ? typeChars.null : typeChars.undefined;
    }

    const dictionaryChar = stringToDictionaryChar[input];
    return dictionaryChar == null
      ? typeChars.string + input.length + ":" + input
      : typeChars.dictionary + dictionaryChar;
  },

  strOrNum(input: string | number): string {
    if (typeof input === "string") {
      const dictionaryChar = stringToDictionaryChar[input];
      return dictionaryChar == null
        ? typeChars.string + input.length + ":" + input
        : typeChars.dictionary + dictionaryChar;
    }

    const str = input.toString();
    return typeChars.number + str.length + ":" + str;
  },

  nullableStrOrNum(input: string | number | null | undefined): string {
    if (input == null) {
      return input === null ? typeChars.null : typeChars.undefined;
    }

    if (typeof input === "string") {
      const dictionaryChar = stringToDictionaryChar[input];
      return dictionaryChar == null
        ? typeChars.string + input.length + ":" + input
        : typeChars.dictionary + dictionaryChar;
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
      const dictionaryChar = stringToDictionaryChar[input];
      return dictionaryChar == null
        ? typeChars.string + input.length + ":" + input
        : typeChars.dictionary + dictionaryChar;
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

  json(input: unknown) {
    return pack.nullableStr(input != null ? JSON.stringify(input) : input);
  },
};

/**
 * blazingly fast utility functions to deserialize content in the Wire encoding
 * protocol.
 */
export const unpack = {
  str(input: string, cursor: number): [string, number] {
    if (input.charCodeAt(cursor) === typeCharCodes.dictionary) {
      // if we found a dictionary match, then return the value from the
      // built-in dictionary
      return [charCodeToDictionaryString[input.charCodeAt(cursor + 1)] ?? "", cursor + 2];
    }

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
    if (input.charCodeAt(cursor) === typeCharCodes.string) {
      return unpack.str(input, cursor + 1);
    }

    if (input.charCodeAt(cursor) === typeCharCodes.dictionary) {
      // if we found a dictionary match, then return the value from the
      // built-in dictionary
      return [charCodeToDictionaryString[input.charCodeAt(cursor + 1)] ?? "", cursor + 2];
    }

    return [input.charCodeAt(cursor) === typeCharCodes.null ? null : undefined, cursor + 1];
  },

  strOrNum(input: string, cursor: number): [string | number, number] {
    if (input.charCodeAt(cursor) === typeCharCodes.string) {
      return unpack.str(input, cursor + 1);
    }

    if (input.charCodeAt(cursor) === typeCharCodes.number) {
      return unpack.num(input, cursor + 1);
    }

    // if we found a dictionary match, then return the value from the
    // built-in dictionary
    return [charCodeToDictionaryString[input.charCodeAt(cursor + 1)] ?? "", cursor + 2];
  },

  nullableStrOrNum(input: string, cursor: number): [string | number | null | undefined, number] {
    if (input.charCodeAt(cursor) === typeCharCodes.string) {
      return unpack.str(input, cursor + 1);
    }

    if (input.charCodeAt(cursor) === typeCharCodes.number) {
      return unpack.num(input, cursor + 1);
    }

    if (input.charCodeAt(cursor) === typeCharCodes.dictionary) {
      return [charCodeToDictionaryString[input.charCodeAt(cursor + 1)] ?? "", cursor + 2];
    }

    return [input.charCodeAt(cursor) === typeCharCodes.null ? null : undefined, cursor + 1];
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
    if (input.charCodeAt(cursor) === typeCharCodes.string) {
      return unpack.str(input, cursor + 1);
    }

    if (input.charCodeAt(cursor) === typeCharCodes.number) {
      return unpack.num(input, cursor + 1);
    }

    if (input.charCodeAt(cursor) === typeCharCodes.null) {
      return [null, cursor + 1];
    }

    if (input.charCodeAt(cursor) === typeCharCodes.undefined) {
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

  json(input: string, cursor: number): [unknown, number] {
    const str = unpack.nullableStr(input, cursor);

    return [str[0] != null ? JSON.parse(str[0]) : str[0], str[1]];
  },
};
