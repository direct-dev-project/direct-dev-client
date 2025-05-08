import { gzip, gunzip } from "./util.gzip.js";

// ID of the Wire stream version, added to allow backwards compatible
// versioning of wire encoder/decoders between backend and clients
const VERSION_ID = 1;

export type WireStreamSegment =
  | { type: "head"; value: string }
  | { type: "item"; value: string }
  | { type: "tail"; value: string };

/**
 * Basic stream implementation which uses the Wire protocol to perform
 * blazingly fast writes of sequentiel entries of variable length.
 */
export class WireEncodeStream extends ReadableStream<Uint8Array> {
  /**
   * specifies the last pushed item type, so we can enforce correct ordering of
   * segments on the stream.
   */
  #lastSegmentType: "head" | "item" | "tail" | undefined;

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
   * reference to the onCancel callback provided when creating the stream,
   * allowing automatic clean up when receiver stops listening.
   */
  readonly #onCancelHandler?: (reason?: unknown) => void;

  /**
   * provides an estimate of the combined size of all entries currently pushed
   * to the stream
   */
  get sizeInBytes(): number {
    return this.#sizeInBytes;
  }

  constructor(config?: { maxSize?: number; onCancel?: (reason?: unknown) => void }) {
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
    });

    this.#onCancelHandler = config?.onCancel;
    this.#maxSize = config?.maxSize ?? Infinity;

    this.#controllerRef = controllerRef;
    this.#controllerRef.current?.enqueue(new Uint8Array([VERSION_ID]));
  }

  /**
   * push a head segment onto the stream
   *
   * @note only a single head is allowed per stream, and it must be the first
   *       segment pushed onto the stream.
   */
  async pushHead(input: string, options?: { compress: boolean }) {
    if (this.#lastSegmentType !== undefined) {
      throw new Error("WireEncodeStream: cannot push head after already pushing other segments");
    }

    this.#lastSegmentType = "head";

    await this.#push(HEAD_CHAR, this.#textEncoder.encode(input), options?.compress ?? false);
  }

  /**
   * push an item segment onto the stream
   *
   * @note an arbitrary number of item segments can be pushed onto the stream,
   *       but they must proceed head segment (if present) and preceed tail
   *       segment (if present)
   */
  async pushItem(input: string, options?: { compress: boolean }) {
    if (this.#lastSegmentType === "tail") {
      throw new Error("WireEncodeStream: cannot push item after having pushed a tail segment");
    }

    this.#lastSegmentType = "item";

    await this.#push(ITEM_CHAR, this.#textEncoder.encode(input), options?.compress ?? false);
  }

  /**
   * push a tail segment onto the stream
   *
   * @note only a single tail is allowed per stream, and afterwards the stream
   *       must be closed (ie. no more data may be pushed onto it).
   */
  async pushTail(input: string, options?: { compress: boolean }) {
    if (this.#lastSegmentType === "tail") {
      throw new Error("WireEncodeStream: cannot push multiple tail segments to stream");
    }

    this.#lastSegmentType = "tail";

    await this.#push(TAIL_CHAR, this.#textEncoder.encode(input), options?.compress ?? false);
  }

  /**
   * push arbitrary inputs onto the stream, automatically adding length of the
   * segment as a head using LEB-64 algorithm
   */
  async #push(
    segmentType: typeof HEAD_CHAR | typeof ITEM_CHAR | typeof TAIL_CHAR,
    input: Uint8Array,
    compress: boolean,
  ): Promise<void> {
    if (input.byteLength > this.#maxSize) {
      throw new Error("WireEncodeStream: maximum stream size has been exceeded");
    }

    //
    // STEP: perform compression of raw input if necessary
    //
    const payload = await (async () => {
      if (!compress) {
        // if compression hasn't been explicitly enabled, then simply use the
        // raw input as payload
        return input;
      }

      // ... otherwise perform gzip and use the compressed output if a certain
      // threshold of savings is reached
      const encoded = await gzip(input);

      return encoded.byteLength < input.byteLength * 0.95 && encoded.byteLength < input.byteLength - 10
        ? encoded
        : input;
    })();

    //
    // STEP: add prefix character to output, so WireDecodeStream can correctly
    // recognize the segment
    //
    let prefix = (() => {
      if (payload === input) {
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
    this.#sizeInBytes += 2;
  }

  /**
   * intercept calls to "cancel", allowing integrations to register when a
   * stream is closed and perform automatic clean-up.
   */
  cancel(reason?: unknown) {
    this.#onCancelHandler?.();
    return super.cancel(reason);
  }
}

/**
 * An inverse of the WireEncodeStream, this stream has been designed to take a
 * request body stream and expose a reader that transforms the incoming
 * signature into an AsyncGenerator for convenient and fast stream processing.
 */
export class WireDecodeStream {
  /**
   * specifies if version of the input stream has been checked yet
   */
  #isVersionChecked = false;

  /**
   * specifies the last pushed item type, so we can enforce correct ordering of
   * segments on the stream.
   */
  #lastSegmentType: "head" | "item" | "tail" | undefined;

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

  constructor(
    stream: ReadableStream<Uint8Array>,
    config?: {
      maxSize?: number;
    },
  ) {
    this.#readStream = stream;
    this.#maxSize = config?.maxSize ?? Infinity;
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
      this.#sizeInBytes += result.value.byteLength;

      if (this.#sizeInBytes > this.#maxSize) {
        throw new Error("WireDecodeStream: maximum stream size has been exceeded");
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
        if (this.#lastSegmentType === "tail") {
          throw new Error("WireDecodeStream: data found after tail segment");
        }

        // if we haven't extracted the version of the parser yet, then do so
        // now to guarantee correctness of incoming data
        if (!this.#isVersionChecked) {
          const version = this.#buffer[this.#cursor++];

          if (version !== VERSION_ID) {
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

        if (segmentType === "head" && this.#lastSegmentType !== undefined) {
          throw new Error("WireDecodeStream: received head segment after already receiving other segments");
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
        this.#lastSegmentType = segmentType;

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
