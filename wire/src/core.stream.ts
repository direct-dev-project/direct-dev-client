import { makeDeferred, PushableAsyncGenerator } from "@direct.dev/shared";

import { pack, WIRE_ENCODE_OFFSET } from "./core.pack.js";

// ID of the Wire stream version, added to allow backwards compatible
// versioning of wire encoder/decoders between backend and clients
const VERSION_ID = 1;
const VERSION_CHAR = String.fromCharCode(48 + VERSION_ID); // technically limited at 65.000'ish versions

export type WireStreamEntry<T, TDone = null> =
  | {
      done: false;
      value: T;
      version: number;
    }
  | {
      done: true;
      value: TDone;
      version: number;
    };

/**
 * Basic stream implementation which uses the Wire protocol to perform
 * blazingly fast writes of sequentiel entries of variable length.
 */
export class WireEncodeStream extends ReadableStream<Uint8Array> {
  /**
   * utility to transform an in-memory array of encoded content into a
   * stringified WireEncodeStream that can be handled without the need for a
   * streaming interface.
   */
  public static fromArray<T>(input: T[], encoder: (item: T) => string): string {
    let result = "";

    // push individual items to the result stream
    for (const item of input) {
      result += "0" + pack.str(encoder(item));
    }

    // close the stream
    return result + "2";
  }

  /**
   * contains the approximated current size of the stream, so that integrations
   * can prevent pushing too much data to a non-consumed stream (relevant in
   * cases where entries are aggregated over longer periods of time).
   */
  #sizeInBytes = 1;

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
   * internal promise instance which will be resolved when the stream is
   * closed, supporting the `wait()` call below.
   */
  readonly #deferred = makeDeferred<undefined>();

  /**
   * provides an estimate of the combined size of all entries currently pushed
   * to the stream
   */
  get sizeInBytes(): number {
    return this.#sizeInBytes;
  }

  constructor(cb?: (push: (input: string) => void) => Promise<string | null | undefined> | string | null | undefined) {
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

    this.#controllerRef = controllerRef;
    this.#controllerRef.current?.enqueue(this.#textEncoder.encode(VERSION_CHAR));

    if (cb !== undefined) {
      Promise.resolve(cb(this.push.bind(this)))
        .then((res) => this.close(res))
        .catch((err) => {
          this.close();
          throw err;
        });
    }
  }

  /**
   * push the specified input to the stream.
   */
  push(input: string): void {
    // @ENCODE STRING LENGTH
    let len = input.length;
    let prefix = "0";
    while (len > 0) {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
    }

    this.#controllerRef.current?.enqueue(this.#textEncoder.encode(prefix + input));
    this.#sizeInBytes += prefix.length + input.length;
  }

  /**
   * push the specified report to the stream and close the stream for further
   * handling.
   */
  close(input?: string | null): void {
    if (input != null) {
      // @ENCODE STRING LENGTH
      let len = input.length;
      let prefix = "1";

      while (len > 0) {
        let byte = len & 0b00111111;
        len >>= 6;
        if (len > 0) byte |= 0b01000000;
        prefix += String.fromCharCode(byte + WIRE_ENCODE_OFFSET);
      }

      this.#controllerRef.current?.enqueue(this.#textEncoder.encode(prefix + input));
      this.#controllerRef.current?.close();
      this.#sizeInBytes += input.length + prefix.length;
    } else {
      this.#controllerRef.current?.enqueue(this.#textEncoder.encode("2"));
      this.#controllerRef.current?.close();
      this.#sizeInBytes += 1;
    }

    this.#deferred.__resolve(undefined);
  }

  /**
   * returns a promise that resolves once the stream has been closed.
   */
  async wait(): Promise<void> {
    await this.#deferred;
  }
}

/**
 * An inverse of the WireEncodeStream, this stream has been designed to take a
 * request body stream and expose a reader that transforms the incoming
 * signature into an AsyncGenerator for convenient and fast stream processing.
 */
export class WireDecodeStream {
  /**
   * internal promise instance which will be resolved when the stream is
   * closed, supporting the `wait()` call below.
   */
  readonly #deferred = makeDeferred<undefined>();

  /**
   * utility to transform an in-memory string into a WireDecodeStream
   * generator, for convenience in cases where data isn't actually read from a
   * stream.
   */
  public static fromString<T = string, TDone = string>(
    input: string,
    transformEntry: (input: string, version: number) => Promise<T> | T = (input) => input as T,
    transformDone: (input: string, version: number) => Promise<TDone> | TDone = (input) => input as TDone,
  ): PushableAsyncGenerator<WireStreamEntry<T, TDone>> {
    const wireVersion = input.charCodeAt(0) - 48;

    return new PushableAsyncGenerator(async (push) => {
      let buffer = input.slice(1);

      while (buffer.length > 0) {
        if (buffer.charCodeAt(0) === 50) {
          // if we received a full-stop character ("2") then end the stream
          // instantly
          return;
        }

        // @DECODE STRING LENGTH
        let cursor = 1;
        let len = 0;
        let shift = 0;
        let byte;

        do {
          byte = buffer.charCodeAt(cursor++) - WIRE_ENCODE_OFFSET;
          len |= (byte & 0b00111111) << (shift++ * 6);
        } while (byte & 0b01000000);

        // if we found the length of the next entry, and we can tell that the
        // stream includes the entirety of the encoded object, then perform
        // parsing
        if (!Number.isNaN(byte) && buffer.length >= cursor + len) {
          const done = buffer.charCodeAt(0) === 49;
          const value = buffer.slice(cursor, cursor + len);

          if (!done) {
            // yield the decoded entry
            push({
              done: false,
              value: await transformEntry(value, wireVersion),
              version: wireVersion,
            });

            // slice the buffer, so that the previously emitted value is no
            // longer retained in-memory
            buffer = buffer.slice(cursor + len);
          } else {
            // if we get here, the final response has been received - emit it
            // and break further execution
            push({
              done: true,
              value: await transformDone(value, wireVersion),
              version: wireVersion,
            });
            return;
          }
        } else {
          break;
        }
      }
    });
  }

  /**
   * exposes the version of the received Wire stream, so integrations can take
   * meassures to add backwards compatibility for legacy clients when handling
   * data.
   */
  readonly version = makeDeferred<number>();

  /**
   * the provided readable stream, from which entries will be read and emitted
   * as soon as they become available.
   */
  readonly #readStream: ReadableStream<Uint8Array>;

  /**
   * text decoder used to convert input from a fetch-compatible UInt8Array into
   * a string representation for processing by the Wire protocol.
   */
  #textDecoder = new TextDecoder();

  /**
   * in-memory buffering of Wire content, which is used while content is still
   * being received.
   */
  #buffer = "";

  constructor(stream: ReadableStream<Uint8Array>) {
    this.#readStream = stream;
  }

  /**
   * transform the stream into an AsyncGenerator that yields entries
   * sequentially as soon as they become available.
   */
  async *getReader<T = string, TDone = string>(
    transformEntry: (input: string, version: number) => Promise<T> | T = (input) => input as T,
    transformDone: (input: string, version: number) => Promise<TDone> | TDone = (input) => input as TDone,
  ): AsyncGenerator<WireStreamEntry<T, TDone>> {
    try {
      const reader = this.#readStream.getReader();

      let wireVersion: number | undefined;
      let result: ReadableStreamReadResult<Uint8Array> | undefined;

      while (!(result = await reader.read()).done) {
        this.#buffer += this.#textDecoder.decode(result.value);

        // if we haven't extracted the version of the parser yet, then do so now
        if (wireVersion === undefined) {
          this.version.__resolve((wireVersion = this.#buffer.charCodeAt(0) - 48));
          this.#buffer = this.#buffer.slice(1);
        }

        while (this.#buffer.length > 0) {
          if (this.#buffer.charCodeAt(0) === 50) {
            // if we received a full-stop character ("2") then end the stream
            // instantly
            return;
          }

          // @DECODE STRING LENGTH
          let cursor = 1;
          let len = 0;
          let shift = 0;
          let byte;

          do {
            byte = this.#buffer.charCodeAt(cursor++) - WIRE_ENCODE_OFFSET;
            len |= (byte & 0b00111111) << (shift++ * 6);
          } while (byte & 0b01000000);

          // if we found the length of the next entry, and we can tell that the
          // stream includes the entirety of the encoded object, then perform
          // parsing
          if (!Number.isNaN(byte) && this.#buffer.length >= cursor + len) {
            const done = this.#buffer.charCodeAt(0) === 49;
            const value = this.#buffer.slice(cursor, cursor + len);

            if (!done) {
              // yield the decoded entry
              yield {
                done: false,
                value: await transformEntry(value, wireVersion),
                version: wireVersion,
              };

              // slice the buffer, so that the previously emitted value is no
              // longer retained in-memory
              this.#buffer = this.#buffer.slice(cursor + len);
            } else {
              // if we get here, the final response has been received - emit it
              // and break further execution
              yield {
                done: true,
                value: await transformDone(value, wireVersion),
                version: wireVersion,
              };
              return;
            }
          } else {
            break;
          }
        }
      }

      // if we get here, essentially something went wrong with the stream -
      // format is invalid or the pipe broke :(
      throw new Error(
        "WireDecodeStream.getReader(): reached unexpected end of reader loop without receiving encoded report entry",
      );
    } finally {
      this.#deferred.__resolve(undefined);
    }
  }

  /**
   * utility to read the string value of the entire input stream.
   */
  async toString(): Promise<string> {
    const reader = this.#readStream.getReader();

    let buffer = "";
    let result: ReadableStreamReadResult<Uint8Array> | undefined;

    while (!(result = await reader.read()).done) {
      buffer += this.#textDecoder.decode(result.value);
    }

    return buffer;
  }

  /**
   * returns a promise that resolves once the stream has been closed.
   */
  async wait(): Promise<void> {
    await this.#deferred;
  }
}
