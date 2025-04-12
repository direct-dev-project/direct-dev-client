/**
 * blazingly fast utility functions to pack primitive input types to the Wire
 * format, yielding very small payload sizes and offering extremely fast
 * encoding + decoding.
 *
 * these utilities were not written to be "pretty" or easily maintainable, but
 * rather to perform as fast as possible to reduce overhead during runtime;
 * this means that we inline the same pieces of code in multiple places to
 * avoid function call overheads
 *
 * the core principle for these packers are as follows:
 *
 * 1) Type information is stored as a single character, ranging from charCode
 *    128 and up. Type information is only included in output when it cannot be
 *    inferred from call context.
 *
 * 2) String content is encoded using a look-ahead friendly format that doesn't
 *    need encoding/decoding of the string itself. We use a base-64 encoding of
 *    the variable string length based on the LEB128 algorithm, but using
 *    only the first 6 bits in every byte, and the 7th bit to terminate the
 *    length. This allows for blazingly fast encoding and very small payload
 *    size overhead, while ensuring that characters used to encode length fits
 *    inside single-byte UTF-8 characters (code points range 0-127).
 *
 * 3) Strings are further optimized by employing a dicitonary of common,
 *    well-known words that are encoded into a single character starting from
 *    charCode 0b11000000 (thus never colliding with type information
 *    characters, while still only requiring a single byte for encoding in
 *    UTF-8).
 *
 * 4) Arrays are encoded similarly to strings, using the same algorithm to
 *    encode the length of the input, and then pushing encoded content for
 *    every entry afterwards.
 */

export const pack = {
  str(input: string): string {
    // @ENCODE DICTIONARY
    const dictionaryChar = DICTIONARY_TO_CHAR.get(input);

    if (dictionaryChar != null) {
      return dictionaryChar;
    }

    // @ENCODE STRING
    let len = input.length;
    let prefix = "";

    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (len > 0);

    return prefix + input;
  },

  nullableStr(input: string | null | undefined): string {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    // @ENCODE DICTIONARY
    const dictionaryChar = DICTIONARY_TO_CHAR.get(input);

    if (dictionaryChar != null) {
      return dictionaryChar;
    }

    // @ENCODE STRING
    let len = input.length;
    let prefix = "";
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (len > 0);

    return prefix + input;
  },

  strOrNum(input: string | number): string {
    if (typeof input === "number") {
      // @ENCODE NUMBER
      return TYPE_CHARS.number + input + NUMBER_TERMINATOR;
    }

    // @ENCODE DICTIONARY
    const dictionaryChar = DICTIONARY_TO_CHAR.get(input);

    if (dictionaryChar != null) {
      return dictionaryChar;
    }

    // @ENCODE STRING
    let len = input.length;
    let prefix = "";
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (len > 0);

    return prefix + input;
  },

  nullableStrOrNum(input: string | number | null | undefined): string {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    if (typeof input === "number") {
      // @ENCODE NUMBER
      return TYPE_CHARS.number + input + NUMBER_TERMINATOR;
    }

    // @ENCODE DICTIONARY
    const dictionaryChar = DICTIONARY_TO_CHAR.get(input);

    if (dictionaryChar != null) {
      return dictionaryChar;
    }

    // @ENCODE STRING
    let len = input.length;
    let prefix = "";
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (len > 0);

    return prefix + input;
  },

  num(input: number): string {
    // @ENCODE NUMBER
    return input + NUMBER_TERMINATOR;
  },

  nullableNum(input: number | null | undefined): string {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    // @ENCODE NUMBER
    return TYPE_CHARS.number + input + NUMBER_TERMINATOR;
  },

  int(input: number): string {
    // @ENCODE INT
    input = input >>> 0;
    let res = "";
    do {
      let byte = input & 0b00111111;
      input >>= 6;
      if (input > 0) byte |= 0b01000000;
      res += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (input > 0);

    return res;
  },

  nullableInt(input: number | null | undefined): string {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    // @ENCODE INT
    input = input >>> 0;
    let res = "";
    do {
      let byte = input & 0b00111111;
      input >>= 6;
      if (input > 0) byte |= 0b01000000;
      res += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (input > 0);

    return res;
  },

  date(input: Date): string {
    // @ENCODE DATE
    const timeStamp = (input.getTime() / 1000) | 0;
    const ms = input.getMilliseconds();

    return (
      String.fromCharCode((timeStamp & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 7) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 14) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 21) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 28) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode((ms & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((ms >> 7) & 0b01111111) + WIRE_ENCODE_OFFSET)
    );
  },

  nullableDate(input: Date | null | undefined): string {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    // @ENCODE DATE
    const timeStamp = (input.getTime() / 1000) | 0;
    const ms = input.getMilliseconds();

    return (
      TYPE_CHARS.date +
      String.fromCharCode((timeStamp & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 7) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 14) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 21) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((timeStamp >> 28) & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode((ms & 0b01111111) + WIRE_ENCODE_OFFSET) +
      String.fromCharCode(((ms >> 7) & 0b01111111) + WIRE_ENCODE_OFFSET)
    );
  },

  bool(input: boolean): string {
    // @ENCODE BOOLEAN
    return input ? TYPE_CHARS.boolean_true : TYPE_CHARS.boolean_false;
  },

  nullableBool(input: boolean | null | undefined): string {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    // @ENCODE BOOLEAN
    return input ? TYPE_CHARS.boolean_true : TYPE_CHARS.boolean_false;
  },

  primitive(input: string | number | boolean | null | undefined) {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    switch (typeof input) {
      case "boolean":
        // @ENCODE BOOLEAN
        return input ? TYPE_CHARS.boolean_true : TYPE_CHARS.boolean_false;

      case "number":
        // @ENCODE NUMBER
        return TYPE_CHARS.number + input + NUMBER_TERMINATOR;
    }

    // @ENCODE STRING
    let len = input.length;
    let prefix = "";
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (len > 0);

    return prefix + input;
  },

  arr<T>(input: T[], pack: (item: T) => string): string {
    // @ENCODE ARRAY
    let len = input.length;
    let result = "";
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      result += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (len > 0);

    for (const item of input) {
      result += pack(item);
    }

    return result;
  },

  json(input: unknown) {
    // @ENCODE NULLABLE
    if (input == null) {
      return input === null ? TYPE_CHARS.null : TYPE_CHARS.undefined;
    }

    // @ENCODE STRING
    const str = JSON.stringify(input);
    let len = str.length;
    let prefix = "";
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    } while (len > 0);

    return prefix + str;
  },
};

/**
 * blazingly fast utility functions to deserialize content in the Wire encoding
 * protocol.
 */
export const unpack = {
  str(input: string, cursor: number): [string, number] {
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE DICTIONARY
    if (byte >= DICTIONARY_OFFSET) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return [DICTIONARY_FROM_CODE.get(byte)!, cursor + 1];
    }

    // @DECODE STRING
    let len = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      len |= (byte & 0b00111111) << (shift++ * 6);
    }

    cursor++;

    return len > 0 ? [input.slice(cursor, cursor + len), cursor + len] : [input.slice(cursor), input.length];
  },

  nullableStr(input: string, cursor: number): [string | null | undefined, number] {
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE DICTIONARY
    if (byte >= DICTIONARY_OFFSET) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return [DICTIONARY_FROM_CODE.get(byte)!, cursor + 1];
    }

    // @DECODE STRING
    let len = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      len |= (byte & 0b00111111) << (shift++ * 6);
    }

    cursor++;

    return len > 0 ? [input.slice(cursor, cursor + len), cursor + len] : [input.slice(cursor), input.length];
  },

  strOrNum(input: string, cursor: number): [string | number, number] {
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NUMBER
    if (byte === TYPE_CODES.number) {
      let len = 1;
      while (input.charCodeAt(cursor + len) > 33) {
        len++;
      }

      return [parseFloat(input.slice(cursor + 1, cursor + len)), cursor + len + 1];
    }

    // @DECODE DICTIONARY
    if (byte >= DICTIONARY_OFFSET) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return [DICTIONARY_FROM_CODE.get(byte)!, cursor + 1];
    }

    // @DECODE STRING
    let len = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      len |= (byte & 0b00111111) << (shift++ * 6);
    }

    cursor++;

    return len > 0 ? [input.slice(cursor, cursor + len), cursor + len] : [input.slice(cursor), input.length];
  },

  nullableStrOrNum(input: string, cursor: number): [string | number | null | undefined, number] {
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE NUMBER
    if (byte === TYPE_CODES.number) {
      let len = 1;
      while (input.charCodeAt(cursor + len) > 33) {
        len++;
      }

      return [parseFloat(input.slice(cursor + 1, cursor + len)), cursor + len + 1];
    }

    // @DECODE DICTIONARY
    if (byte >= DICTIONARY_OFFSET) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return [DICTIONARY_FROM_CODE.get(byte)!, cursor + 1];
    }

    // @DECODE STRING
    let len = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      len |= (byte & 0b00111111) << (shift++ * 6);
    }

    cursor++;

    return len > 0 ? [input.slice(cursor, cursor + len), cursor + len] : [input.slice(cursor), input.length];
  },

  num(input: string, cursor: number): [number, number] {
    // @DECODE NUMBER
    let len = 0;
    while (input.charCodeAt(cursor + len) > 33) {
      len++;
    }

    return [parseFloat(input.slice(cursor, cursor + len)), cursor + len + 1];
  },

  nullableNum(input: string, cursor: number): [number | null | undefined, number] {
    const byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE NUMBER
    let len = 0;
    while (input.charCodeAt(cursor + len) > 33) {
      len++;
    }

    return [parseFloat(input.slice(cursor + 1, cursor + len)), cursor + len + 1];
  },

  int(input: string, cursor: number): [number, number] {
    // @DECODE INT
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;
    let res = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      res |= (byte & 0b00111111) << (shift++ * 6);
    }

    return [res, cursor + 1];
  },

  nullableInt(input: string, cursor: number): [number | null | undefined, number] {
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE INT
    let res = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      res |= (byte & 0b00111111) << (shift++ * 6);
    }

    return [res, cursor + 1];
  },

  date(input: string, cursor: number): [Date, number] {
    // @DECODE DATE
    let timeStamp = 0;
    timeStamp |= input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;
    timeStamp |= (input.charCodeAt(cursor + 1) - WIRE_ENCODE_OFFSET) << 7;
    timeStamp |= (input.charCodeAt(cursor + 2) - WIRE_ENCODE_OFFSET) << 14;
    timeStamp |= (input.charCodeAt(cursor + 3) - WIRE_ENCODE_OFFSET) << 21;
    timeStamp |= (input.charCodeAt(cursor + 4) - WIRE_ENCODE_OFFSET) << 28;

    let ms = 0;
    ms |= input.charCodeAt(cursor + 5) - WIRE_ENCODE_OFFSET;
    ms |= (input.charCodeAt(cursor + 6) - WIRE_ENCODE_OFFSET) << 7;

    return [new Date(timeStamp * 1000 + ms), cursor + 7];
  },

  nullableDate(input: string, cursor: number): [Date | null | undefined, number] {
    const byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE DATE
    let timeStamp = 0;
    timeStamp |= input.charCodeAt(cursor + 1) - WIRE_ENCODE_OFFSET;
    timeStamp |= (input.charCodeAt(cursor + 2) - WIRE_ENCODE_OFFSET) << 7;
    timeStamp |= (input.charCodeAt(cursor + 3) - WIRE_ENCODE_OFFSET) << 14;
    timeStamp |= (input.charCodeAt(cursor + 4) - WIRE_ENCODE_OFFSET) << 21;
    timeStamp |= (input.charCodeAt(cursor + 5) - WIRE_ENCODE_OFFSET) << 28;

    let ms = 0;
    ms |= input.charCodeAt(cursor + 6) - WIRE_ENCODE_OFFSET;
    ms |= (input.charCodeAt(cursor + 7) - WIRE_ENCODE_OFFSET) << 7;

    return [new Date(timeStamp * 1000 + ms), cursor + 8];
  },

  bool(input: string, cursor: number): [boolean, number] {
    // @DECODE BOOL
    return [input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET === TYPE_CODES.boolean_true, cursor + 1];
  },

  nullableBool(input: string, cursor: number): [boolean | null | undefined, number] {
    const byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE BOOL
    return [byte === TYPE_CODES.boolean_true, cursor + 1];
  },

  primitive(input: string, cursor: number): [string | number | boolean | null | undefined, number] {
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE BOOL
    if (byte === TYPE_CODES.boolean_true) {
      return [true, cursor + 1];
    }

    if (byte === TYPE_CODES.boolean_false) {
      return [false, cursor + 1];
    }

    // @DECODE DICTIONARY
    if (byte >= DICTIONARY_OFFSET) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return [DICTIONARY_FROM_CODE.get(byte)!, cursor + 1];
    }

    // @DECODE NUMBER
    if (byte === TYPE_CODES.number) {
      let len = 1;
      while (input.charCodeAt(cursor + len) > 33) {
        len++;
      }

      return [parseFloat(input.slice(cursor + 1, cursor + len)), cursor + len + 1];
    }

    // @DECODE STRING
    let len = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      len |= (byte & 0b00111111) << (shift++ * 6);
    }

    cursor++;

    return len > 0 ? [input.slice(cursor, cursor + len), cursor + len] : [input.slice(cursor), input.length];
  },

  arr<T>(input: string, cursor: number, unpack: (cursor: number) => [T, number]): [T[], number] {
    // @DECODE ARRAY
    let len = 0;
    let shift = 0;
    let byte;

    do {
      byte = input.charCodeAt(cursor++) - WIRE_ENCODE_OFFSET;
      len |= (byte & 0b00111111) << (shift++ * 6);
    } while (byte & 0b01000000);

    if (len < 0) {
      return [[], input.length];
    }

    // prepare result array with predefined length for maximum performance
    const result: T[] = new Array(len);

    // iterate over the array and extract each value
    for (let i = 0; i < len; i++) {
      const value = unpack(cursor);
      result[i] = value[0];
      cursor = value[1];
    }

    return [result, cursor];
  },

  json(input: string, cursor: number): [unknown, number] {
    let byte = input.charCodeAt(cursor) - WIRE_ENCODE_OFFSET;

    // @DECODE NULLABLE
    if (byte === TYPE_CODES.null) {
      return [null, cursor + 1];
    }

    if (byte === TYPE_CODES.undefined) {
      return [void 0, cursor + 1];
    }

    // @DECODE STRING
    let len = byte & 0b00111111;
    let shift = 1;

    while (byte & 0b01000000) {
      byte = input.charCodeAt(++cursor) - WIRE_ENCODE_OFFSET;
      len |= (byte & 0b00111111) << (shift++ * 6);
    }

    cursor++;

    return len > 0
      ? [JSON.parse(input.slice(cursor, cursor + len)), cursor + len]
      : [JSON.parse(input.slice(cursor)), input.length];
  },
};

//
// Can be used to increment special character codes used by Wire, in order to
// produce a more human-readable format which can be useful during debugging
//
export const WIRE_ENCODE_OFFSET = 0;

//
// Null character which is used to delimit numbers in the Wire format
//
const NUMBER_TERMINATOR = String.fromCharCode(33);

//
// Reserved character codes for encoding of type information when it is
// necessary
//
const TYPES = ["number", "date", "boolean_false", "boolean_true", "null", "undefined"] as const;
const TYPES_OFFSET = 0b100000000;

const TYPE_CODES = Object.fromEntries(TYPES.map((type, index) => [type, TYPES_OFFSET + index])) as Record<
  (typeof TYPES)[number],
  number
>;

const TYPE_CHARS = Object.fromEntries(
  TYPES.map((type, index) => [type, String.fromCharCode(TYPES_OFFSET + WIRE_ENCODE_OFFSET + index)]),
) as Record<(typeof TYPES)[number], string>;

//
// Dictionary of well-known, common strings for further compression of output
// sizes
//
export const WIRE_DICTIONARY = [
  // block height tags
  "latest",
  "finalized",
  "pending",
  "safe",

  // request reports
  "client",
  "entry",
  "mirror",
  "distributor",

  "hit",
  "miss",
  "inflight",
  "ineligible",
  "prefetch",

  "wire",
  "ndjson",
  "json",
  "multi-json",

  // errors from Direct.dev
  "failed to receive response (Direct.dev)",
  "request timed out (Direct.dev)",
  "request was not found in cache (Direct.dev)",
  "cannot parse block height param (Direct.dev)",
  "the block height param is out of range (Direct.dev)",
];
const DICTIONARY_OFFSET = 0b110000000 + WIRE_ENCODE_OFFSET;

const DICTIONARY_TO_CHAR = new Map(
  WIRE_DICTIONARY.map((word, index) => [word, String.fromCharCode(DICTIONARY_OFFSET + WIRE_ENCODE_OFFSET + index)]),
);
const DICTIONARY_FROM_CODE = new Map(WIRE_DICTIONARY.map((word, index) => [DICTIONARY_OFFSET + index, word]));
