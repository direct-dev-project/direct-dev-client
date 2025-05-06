import { makeDeferred, PushableAsyncGenerator } from "@direct.dev/shared";

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
    let result = VERSION_CHAR;

    // push individual items to the result stream
    for (const item of input) {
      // @ENCODE STRING LENGTH
      const str = encoder(item);
      let len = str.length;
      let prefix = "1";
      do {
        let byte = len & 0b00111111;
        len >>= 6;
        if (len > 0) byte |= 0b01000000;
        prefix += String.fromCharCode(byte);
      } while (len > 0);

      result += prefix + str;
    }

    // close the stream
    return result + "3";
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

  constructor(config?: { sessionId?: string; onCancel?: (reason?: unknown) => void }) {
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
    this.#controllerRef = controllerRef;
    this.#controllerRef.current?.enqueue(this.#textEncoder.encode(VERSION_CHAR));

    if (config?.sessionId !== undefined) {
      // @ENCODE STRING LENGTH
      let len = config.sessionId.length;
      let prefix = "0";
      do {
        let byte = len & 0b00111111;
        len >>= 6;
        if (len > 0) byte |= 0b01000000;
        prefix += String.fromCharCode(byte);
      } while (len > 0);

      this.#controllerRef.current?.enqueue(this.#textEncoder.encode(prefix + config.sessionId));
    }
  }

  /**
   * push the specified input to the stream.
   */
  push(input: string): void {
    // @ENCODE STRING LENGTH
    let len = input.length;
    let prefix = "1";
    do {
      let byte = len & 0b00111111;
      len >>= 6;
      if (len > 0) byte |= 0b01000000;
      prefix += String.fromCharCode(byte);
    } while (len > 0);

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
      let prefix = "2";

      do {
        let byte = len & 0b00111111;
        len >>= 6;
        if (len > 0) byte |= 0b01000000;
        prefix += String.fromCharCode(byte);
      } while (len > 0);

      this.#controllerRef.current?.enqueue(this.#textEncoder.encode(prefix + input));
      this.#controllerRef.current?.close();
      this.#sizeInBytes += input.length + prefix.length;
    } else {
      this.#controllerRef.current?.enqueue(this.#textEncoder.encode("3"));
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
  ): {
    stream: PushableAsyncGenerator<WireStreamEntry<T, TDone>>;
    version: number;
    sessionId: Promise<string | undefined>;
  } {
    const wireVersion = input.charCodeAt(0) - 48;
    const sessionId = makeDeferred<string | undefined>();

    const stream = new PushableAsyncGenerator<WireStreamEntry<T, TDone>>(async (push) => {
      let buffer = input.slice(1);

      while (buffer.length > 0) {
        if (buffer.charCodeAt(0) === 51) {
          // if we received a full-stop character ("3") then end the stream
          // instantly
          return;
        }

        // @DECODE STRING LENGTH
        let cursor = 1;
        let len = 0;
        let shift = 0;
        let byte;

        do {
          byte = buffer.charCodeAt(cursor++);
          len |= (byte & 0b00111111) << (shift++ * 6);
        } while (byte & 0b01000000);

        // if we found the length of the next entry, and we can tell that the
        // stream includes the entirety of the encoded object, then perform
        // parsing
        if (!Number.isNaN(byte) && buffer.length >= cursor + len) {
          const value = buffer.slice(cursor, cursor + len);

          switch (buffer.charCodeAt(0)) {
            // "0" (we received a session ID)
            case 48:
              sessionId.__resolve(value);
              break;

            // "1" (we received an entry)
            case 49:
              // yield the decoded entry
              push({
                done: false,
                value: await transformEntry(value, wireVersion),
                version: wireVersion,
              });
              break;

            // "2" (we're done, received a final value)
            case 50:
              push({
                done: true,
                value: await transformDone(value, wireVersion),
                version: wireVersion,
              });

              if (!sessionId.__isFulfilled()) {
                sessionId.__resolve(undefined);
              }
              return;
          }

          // slice the buffer, so that the previously emitted value is no
          // longer retained in-memory
          buffer = buffer.slice(cursor + len);
        } else {
          break;
        }
      }

      if (!sessionId.__isFulfilled()) {
        sessionId.__resolve(undefined);
      }
    });

    return {
      stream,
      version: wireVersion,
      sessionId,
    };
  }

  /**
   * exposes the version of the received Wire stream, so integrations can take
   * meassures to add backwards compatibility for legacy clients when handling
   * data.
   */
  readonly version = makeDeferred<number>();

  /**
   * exposes the session ID associated with this stream (if any).
   */
  readonly sessionId = makeDeferred<string | undefined>();

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
        this.#buffer += this.#textDecoder.decode(result.value, { stream: true });

        // if we haven't extracted the version of the parser yet, then do so now
        if (wireVersion === undefined) {
          this.version.__resolve((wireVersion = this.#buffer.charCodeAt(0) - 48));
          this.#buffer = this.#buffer.slice(1);
        }

        while (this.#buffer.length > 0) {
          if (this.#buffer.charCodeAt(0) === 51) {
            // if we received a full-stop character ("3") then end the stream
            // instantly
            return;
          }

          // @DECODE STRING LENGTH
          let cursor = 1;
          let len = 0;
          let shift = 0;
          let byte;

          do {
            byte = this.#buffer.charCodeAt(cursor++);
            len |= (byte & 0b00111111) << (shift++ * 6);
          } while (byte & 0b01000000);

          // if we found the length of the next entry, and we can tell that the
          // stream includes the entirety of the encoded object, then perform
          // parsing
          if (!Number.isNaN(byte) && this.#buffer.length >= cursor + len) {
            const value = this.#buffer.slice(cursor, cursor + len);

            switch (this.#buffer.charCodeAt(0)) {
              // "0" (we received a session ID)
              case 48:
                this.sessionId.__resolve(value);
                break;

              // "1" (we received an entry)
              case 49:
                // yield the decoded entry
                yield {
                  done: false,
                  value: await transformEntry(value, wireVersion),
                  version: wireVersion,
                };
                break;

              // "2" (we're done, received a final value)
              case 50:
                yield {
                  done: true,
                  value: await transformDone(value, wireVersion),
                  version: wireVersion,
                };
                return;
            }

            // slice the buffer, so that the previously emitted value is no
            // longer retained in-memory
            this.#buffer = this.#buffer.slice(cursor + len);
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
      buffer += this.#textDecoder.decode(result.value, { stream: true });
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
