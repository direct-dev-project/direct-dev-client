import { gzip, gunzip, isCompressionSupported } from "./util.gzip.js";

// ID of the Wire stream version, added to allow backwards compatible
// versioning of wire encoder/decoders between backend and clients
export const WIRE_VERSION_ID = 1;

export type WireStreamSegment =
  | { type: "head"; value: string }
  | { type: "item"; value: string }
  | { type: "tail"; value: string };

/**
 * Basic stream implementation which uses the Wire protocol to perform
 * blazingly fast writes of sequentiel entries of variable length.
 */
export class WireEncodeStream extends ReadableStream<Uint8Array> {
  public static readonly MAX_SIZE_ERR = new Error("WireEncodeStream: maximum stream size has been exceeded");

  /**
   * contains the current size of the stream, so that integrations can prevent
   * pushing too much data to a non-consumed stream (relevant in cases where
   * entries are aggregated over longer periods of time).
   */
  #sizeInBytes = 1;

  /**
   * specifies the maximum allowed size of the stream
   */
  readonly #maxSize: number;

  /**
   * cached reference to the ReadableStream controller, which allows us to push
   * entries on-demand further down this stream integration.
   */
  #controllerRef: {
    current: ReadableStreamDefaultController | undefined;
  };

  /**
   * text encoder used to convert input to a fetch-compatible UInt8Array for
   * convenience
   *
   * @note We're using TextEncoder rather than piping through TextEncoderStream
   *       as it yields faster runtime in Cloudflare Workers.
   */
  readonly #textEncoder = new TextEncoder();

  /**
   * event listener triggered when the stream is closed.
   */
  #onClose?: () => void;

  /**
   * provides an estimate of the combined size of all entries currently pushed
   * to the stream
   */
  get sizeInBytes(): number {
    return this.#sizeInBytes;
  }

  constructor(config?: { maxSize?: number; onCancel?: (reason?: unknown) => void; onClose?: () => void }) {
    // create a ref-object (inspired by React), so we can apply the controller
    // when it's provided in the start method below (which is executed prior to
    // the `super()` call resolving, thus resulting in a ReferenceError
    // regarding accessing this too early)
    const controllerRef: { current: ReadableStreamDefaultController | undefined } = {
      current: undefined,
    };

    super({
      start: (controller) => {
        controllerRef.current = controller;
      },

      cancel: (reason) => {
        config?.onCancel?.(reason);
      },
    });

    this.#maxSize = config?.maxSize ?? Infinity;
    this.#onClose = config?.onClose;

    this.#controllerRef = controllerRef;
    this.#controllerRef.current?.enqueue(new Uint8Array([WIRE_VERSION_ID]));
  }

  /**
   * push a head segment onto the stream
   */
  async pushHead(input: string, options?: { compress: boolean }) {
    await this.#push(HEAD_CHAR, this.#textEncoder.encode(input), { compress: options?.compress ?? false });
  }

  /**
   * push a pre-compressed (gzip) head onto the stream
   */
  async pushPrecompressedHead(input: Uint8Array) {
    await this.#push(HEAD_CHAR, input, { preCompressed: true });
  }

  /**
   * push an item segment onto the stream
   */
  async pushItem(input: string, options?: { compress: boolean }) {
    await this.#push(ITEM_CHAR, this.#textEncoder.encode(input), { compress: options?.compress ?? false });
  }

  /**
   * push a pre-compressed (gzip) item onto the stream
   */
  async pushPrecompressedItem(input: Uint8Array) {
    await this.#push(ITEM_CHAR, input, { preCompressed: true });
  }

  /**
   * push a tail segment onto the stream
   */
  async pushTail(input: string, options?: { compress: boolean }) {
    await this.#push(TAIL_CHAR, this.#textEncoder.encode(input), { compress: options?.compress ?? false });
  }

  /**
   * push a pre-compressed (gzip) tail onto the stream
   */
  async pushPrecompressedTail(input: Uint8Array) {
    await this.#push(TAIL_CHAR, input, { preCompressed: true });
  }

  /**
   * push arbitrary inputs onto the stream, automatically adding length of the
   * segment as a head using LEB-64 algorithm
   */
  async #push(
    segmentType: typeof HEAD_CHAR | typeof ITEM_CHAR | typeof TAIL_CHAR,
    input: Uint8Array,
    options:
      | {
          compress: boolean;
          preCompressed?: false;
        }
      | {
          compress?: false;
          preCompressed: true;
        },
  ): Promise<void> {
    if (input.byteLength > this.#maxSize) {
      // while gzip could technically bring us below the predefined maximum
      // size, we do not want singular entries to decode to a size greater than
      // the entire stream budget
      throw new Error("WireEncodeStream: segment is larger than max stream size");
    }

    //
    // STEP: perform compression of raw input if necessary
    //
    const payload = await (async () => {
      if (!options.compress || !isCompressionSupported() || !shouldGzip(input)) {
        // if compression hasn't been explicitly enabled, then simply use the
        // raw input as payload
        return input;
      }

      // ... otherwise perform gzip and use the compressed output if a certain
      // threshold of savings is reached
      const encoded = await gzip(input);

      return input.byteLength - encoded.byteLength >= 20 ? encoded : input;
    })();

    //
    // STEP: add prefix character to output, so WireDecodeStream can correctly
    // recognize the segment
    //
    let prefix = (() => {
      if (payload === input && !options.preCompressed) {
        // if we didn't compress content, then use the prefix "as is"
        return segmentType;
      }

      switch (segmentType) {
        case ITEM_CHAR:
          return ITEM_CHAR__COMPRESSED;

        case HEAD_CHAR:
          return HEAD_CHAR__COMPRESSED;

        case TAIL_CHAR:
          return TAIL_CHAR__COMPRESSED;
      }
    })();

    //
    // STEP: encode length and push head + payload onto the stream
    //
    let len = payload.byteLength;
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte);
    } while (len > 0);

    const nextSizeInBytes = this.#sizeInBytes + prefix.length + payload.byteLength;

    if (nextSizeInBytes >= this.#maxSize) {
      throw new Error("WireEncodeStream: maximum stream size has been exceeded");
    }

    this.#controllerRef.current?.enqueue(this.#textEncoder.encode(prefix));
    this.#controllerRef.current?.enqueue(payload);
    this.#sizeInBytes = nextSizeInBytes;
  }

  /**
   * close the stream and send termination code to inform receiver that it's
   * time to stop processing
   */
  close(): void {
    this.#controllerRef.current?.close();
    this.#onClose?.();
  }
}

/**
 * An inverse of the WireEncodeStream, this stream has been designed to take a
 * request body stream and expose a reader that transforms the incoming
 * signature into an AsyncGenerator for convenient and fast stream processing.
 */
export class WireDecodeStream {
  public static readonly MAX_SIZE_ERR = new Error("WireDecodeStream: maximum stream size has been exceeded");

  /**
   * specifies if version of the input stream has been checked yet
   */
  #isVersionChecked = false;

  /**
   * the provided readable stream, from which entries will be read and emitted
   * as soon as they become available.
   */
  readonly #readStream: ReadableStream<Uint8Array>;

  /**
   * text decoder used to convert input from a fetch-compatible UInt8Array into
   * a string representation for processing by the Wire protocol.
   */
  readonly #textDecoder = new TextDecoder();

  /**
   * in-memory buffering of Wire content, which is used while content is still
   * being received.
   */
  #buffer: Uint8Array | undefined;

  /**
   * in-memory representation of the current read cursor offset, which is
   * necessary to ensure that we do not read the same piece of data multiple
   * times while processing chunked input.
   */
  #cursor = 0;

  /**
   * contains the current size of the stream, so that integrations can prevent
   * pushing too much data to a non-consumed stream (relevant in cases where
   * entries are aggregated over longer periods of time).
   */
  #sizeInBytes = 1;

  /**
   * specifies the maximum allowed size of the stream
   */
  readonly #maxSize: number;

  /**
   * optional reference to abort signal associated with this read
   */
  readonly #abortSignal: AbortSignal | undefined;

  constructor(
    stream: ReadableStream<Uint8Array>,
    config?: {
      maxSize?: number;
      abortSignal?: AbortSignal;
    },
  ) {
    this.#readStream = stream;
    this.#maxSize = config?.maxSize ?? Infinity;
    this.#abortSignal = config?.abortSignal;
  }

  /**
   * returns the size of the currently read contents of the stream
   */
  get sizeInBytes(): number {
    return this.#sizeInBytes;
  }

  /**
   * transform the stream into an AsyncGenerator that yields entries
   * sequentially as soon as they become available.
   */
  async *getReader<TItem, THead, TTail>(transformers: {
    head: (input: string) => THead;
    item: (input: string) => TItem;
    tail: (input: string) => TTail;
  }): AsyncGenerator<
    | (THead extends null ? never : { type: "head"; value: THead })
    | (TItem extends null ? never : { type: "item"; value: TItem })
    | (TTail extends null ? never : { type: "tail"; value: TTail })
  > {
    const reader = this.#readStream.getReader();

    let result: ReadableStreamReadResult<Uint8Array> | undefined;

    while (!(result = await reader.read()).done) {
      if (this.#abortSignal?.aborted) {
        // silently ignore segments if aborted
        continue;
      }

      this.#sizeInBytes += result.value.byteLength;

      if (this.#sizeInBytes > this.#maxSize) {
        throw WireDecodeStream.MAX_SIZE_ERR;
      }

      // push segment to buffer
      if (!this.#buffer?.byteLength) {
        this.#buffer = result.value;
      } else {
        const buff = this.#buffer;
        this.#buffer = new Uint8Array(buff.byteLength + result.value.byteLength);
        this.#buffer.set(buff);
        this.#buffer.set(result.value, buff.byteLength);
      }

      while (this.#buffer.length > this.#cursor) {
        // if we haven't extracted the version of the parser yet, then do so
        // now to guarantee correctness of incoming data
        if (!this.#isVersionChecked) {
          const version = this.#buffer[this.#cursor++];

          if (version !== WIRE_VERSION_ID) {
            throw new Error(`WireDecodeStream: unsupported wire version '${version}'`);
          }

          this.#isVersionChecked = true;
          continue;
        }

        //
        // STEP: read and validate segment head before processing further
        //
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const segmentTypeCode = this.#buffer[this.#cursor++]!;
        const segmentType = SEGMENT_TYPE_MAP[segmentTypeCode];
        const isCompressed = segmentTypeCode & 0b00100000; // lower case ASCII chars are used to denote compressed segments

        if (segmentType === undefined) {
          throw new Error(
            `WireDecodeStream: unsupported segment type received '${String.fromCharCode(segmentTypeCode)}'`,
          );
        }

        // @DECODE SEGMENT LENGTH
        let len = 0;
        let shift = 0;

        while (true) {
          const byte = this.#buffer[this.#cursor++];

          if (byte === undefined) {
            shift++;
            len = Infinity;
            break;
          }

          if (byte & 0b01000000) {
            len |= (byte & 0b00111111) << (shift++ * 6);
          } else {
            len |= (byte & 0b00111111) << (shift++ * 6);
            break;
          }
        }

        //
        // STEP: read and decode segment contents
        //
        const end = this.#cursor + len;

        if (end > this.#buffer.byteLength) {
          this.#cursor -= 1 + shift; // rewind LEB and typeCode
          break;
        }

        const payload = this.#buffer.subarray(this.#cursor, end);
        const decompressed = isCompressed ? await gunzip(payload) : payload;
        const value = transformers[segmentType](this.#textDecoder.decode(decompressed));

        this.#cursor = end;

        if (value != null) {
          yield {
            type: segmentType,
            value,
          } as
            | (THead extends null ? never : { type: "head"; value: THead })
            | (TItem extends null ? never : { type: "item"; value: TItem })
            | (TTail extends null ? never : { type: "tail"; value: TTail });
        } else {
          throw new Error(`WireDecodeStream: encountered unsupported segment type '${segmentType}'`);
        }

        //
        // STEP: remove the consumed part of the buffer
        //
        if (this.#cursor === this.#buffer.byteLength) {
          this.#buffer = new Uint8Array();
          this.#cursor = 0;
        } else {
          this.#buffer = this.#buffer.subarray(this.#cursor);
          this.#cursor = 0;
        }
      }
    }
  }
}

const HEAD_CHAR = "H";
const HEAD_CODE = HEAD_CHAR.charCodeAt(0);
const HEAD_CHAR__COMPRESSED = "h";
const HEAD_CODE__COMPRESSED = HEAD_CHAR__COMPRESSED.charCodeAt(0);
const TAIL_CHAR = "T";
const TAIL_CODE = TAIL_CHAR.charCodeAt(0);
const TAIL_CHAR__COMPRESSED = "t";
const TAIL_CODE__COMPRESSED = TAIL_CHAR__COMPRESSED.charCodeAt(0);
const ITEM_CHAR = "I";
const ITEM_CODE = ITEM_CHAR.charCodeAt(0);
const ITEM_CHAR__COMPRESSED = "i";
const ITEM_CODE__COMPRESSED = ITEM_CHAR__COMPRESSED.charCodeAt(0);

const SEGMENT_TYPE_MAP = {
  [HEAD_CODE]: "head",
  [HEAD_CODE__COMPRESSED]: "head",
  [TAIL_CODE]: "tail",
  [TAIL_CODE__COMPRESSED]: "tail",
  [ITEM_CODE]: "item",
  [ITEM_CODE__COMPRESSED]: "item",
} as const;

/**
 * heuristically determine if gzipping makes sense on a segment, so we avoid
 * creating CompressionStream instances over and over.
 */
function shouldGzip(input: Uint8Array): boolean {
  const len = input.length;

  if (len < 50) {
    // never compress strings of less than 50 characters; gzip overhead would
    // dominate potential savings
    return false;
  }

  if (len >= 250) {
    // always try running gzip on strings longer than 250 characters, as it
    // likely will yield a benefit
    return true;
  }

  // for strings 50-249 characters, determine number of unique characters
  // within the input and determine if we expect enough savings

  // estimate number of unique byte values (0–255)
  const seen = new Uint8Array(256);
  let uniqueBytes = 0;

  for (let i = 0; i < len; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const byte = input[i]!;

    if (seen[byte] === 0) {
      seen[byte] = 1;
      uniqueBytes++;
    }
  }

  const estimatedSize = uniqueBytes * 2 + 25; // gzip overhead

  return len - estimatedSize >= 20; // min expected savings
}
