import { makeDeferred, PushableAsyncGenerator } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";

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
    this.#controllerRef.current?.enqueue(this.#textEncoder.encode("0" + pack.str(input)));
  }

  /**
   * push the specified report to the stream and close the stream for further
   * handling.
   */
  close(input?: string | null): void {
    this.#controllerRef.current?.enqueue(this.#textEncoder.encode(input != null ? "1" + pack.str(input) : "2"));
    this.#controllerRef.current?.close();

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
   * utility to transform an in-memory string into a WireDecodeStream
   * generator, for convenience in cases where data isn't actually read from a
   * stream.
   */
  public static fromString<T = string, TDone = string>(
    input: string,
    transformEntry: (input: string, version: number) => Promise<T> | T = (input) => input as T,
    transformDone: (input: string, version: number) => Promise<TDone> | TDone = (input) => input as TDone,
  ): AsyncGenerator<WireStreamEntry<T, TDone>> {
    const wireVersion = input.charCodeAt(0) - 48;

    return new PushableAsyncGenerator(async (push) => {
      let buffer = input.slice(1);

      while (buffer.length > 0) {
        if (buffer.charCodeAt(0) === 50) {
          // if we received a full-stop character ("2") then end the stream
          // instantly
          return;
        }

        // scan for length of the next item on the stream, using the same
        // low-level optimizations as unpack.str implements
        let cursor = 1;
        let len = 0;

        while (buffer.charCodeAt(cursor) >= 48 && buffer.charCodeAt(cursor) <= 57) {
          len = len * 10 + (buffer.charCodeAt(cursor) - 48);
          cursor++;
        }

        // if we found the length of the next entry, and we can tell that the
        // stream includes the entirety of the encoded object, then perform
        // parsing
        if (cursor > 1 && buffer.length >= cursor + len + 1) {
          const done = buffer.charCodeAt(0) === 49;
          const value = unpack.str(buffer, 1);

          if (!done) {
            // yield the decoded entry
            push({
              done: false,
              value: await transformEntry(value[0], wireVersion),
              version: wireVersion,
            });

            // slice the buffer, so that the previously emitted value is no
            // longer retained in-memory
            buffer = buffer.slice(value[1]);
          } else {
            // if we get here, the final response has been received - emit it
            // and break further execution
            push({
              done: true,
              value: await transformDone(value[0], wireVersion),
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

        // scan for length of the next item on the stream, using the same
        // low-level optimizations as unpack.str implements
        let cursor = 1;
        let len = 0;

        while (this.#buffer.charCodeAt(cursor) >= 48 && this.#buffer.charCodeAt(cursor) <= 57) {
          len = len * 10 + (this.#buffer.charCodeAt(cursor) - 48);
          cursor++;
        }

        // if we found the length of the next entry, and we can tell that the
        // stream includes the entirety of the encoded object, then perform
        // parsing
        if (cursor > 1 && this.#buffer.length >= cursor + len + 1) {
          const done = this.#buffer.charCodeAt(0) === 49;
          const value = unpack.str(this.#buffer, 1);

          if (!done) {
            // yield the decoded entry
            yield {
              done: false,
              value: await transformEntry(value[0], wireVersion),
              version: wireVersion,
            };

            // slice the buffer, so that the previously emitted value is no
            // longer retained in-memory
            this.#buffer = this.#buffer.slice(value[1]);
          } else {
            // if we get here, the final response has been received - emit it
            // and break further execution
            yield {
              done: true,
              value: await transformDone(value[0], wireVersion),
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
}
