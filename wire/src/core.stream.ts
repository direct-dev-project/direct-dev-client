import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

/**
 * A basic implementation of a ReadableStream which allows streaming a series
 * Wire-encoded entries, useful for dispatching batches of requests and
 * responses as fast as possible.
 */
export class WireEncodeStream<TEntry, TReport = null> {
  /**
   * reference to the Wire instances used to encode entries and reportes emitted
   * on this stream.
   */
  #wires: {
    entry: Wire<TEntry>;
    report?: Wire<TReport>;
  };

  /**
   * cached reference to the ReadableStream controller, which allows us to push
   * entries on-demand further down this stream integration.
   */
  #readStreamController: ReadableStreamDefaultController | undefined;

  /**
   * the public readable stream which entries will be emitted upon.
   */
  readonly readStream: ReadableStream;
  #encoder = new TextEncoder();

  constructor(
    wires:
      | Wire<TEntry>
      | {
          entry: Wire<TEntry>;
          report: Wire<TReport>;
        },
  ) {
    this.#wires =
      wires instanceof Wire
        ? {
            entry: wires,
          }
        : wires;

    // create the readable stream which entries will be emitted to, and perform
    // automatic text-encoding so it's easily usable in `fetch`
    this.readStream = new ReadableStream({
      start: (controller) => {
        this.#readStreamController = controller;
      },
    });
  }

  /**
   * push the specified input to the stream.
   */
  push(input: TEntry): void {
    this.#readStreamController?.enqueue(this.#encoder.encode("0" + pack.str(this.#wires.entry.encode(input))));
  }

  /**
   * push the specified report to the stream and close the stream for further
   * handling.
   */
  close(input: TReport): void {
    if (this.#wires.report) {
      this.#readStreamController?.enqueue(this.#encoder.encode("1" + pack.str(this.#wires.report.encode(input))));
    } else {
      this.#readStreamController?.enqueue(this.#encoder.encode("2"));
    }

    this.#readStreamController?.close();
  }
}

/**
 * An inverse of the WireEncodeStream, this stream has been designed to take a
 * request body stream and expose a reader that transforms the incoming
 * signature into an AsyncGenerator for convenient and fast stream processing.
 */
export class WireDecodeStream<TEntry, TReport = null> {
  /**
   * reference to the Wire instances used to encode entries and reportes emitted
   * on this stream.
   */
  #wires: {
    entry: Wire<TEntry>;
    report?: Wire<TReport>;
  };

  /**
   * the provided readable stream, from which entries will be read and emitted
   * as soon as they become available.
   */
  readonly #readStream: ReadableStream;

  #decoder = new TextDecoder();

  constructor(
    wires:
      | Wire<TEntry>
      | {
          entry: Wire<TEntry>;
          report: Wire<TReport>;
        },
    stream: ReadableStream,
  ) {
    this.#readStream = stream;
    this.#wires =
      wires instanceof Wire
        ? {
            entry: wires,
          }
        : wires;
  }

  async *getReader(): AsyncGenerator<
    | {
        done: false;
        value: TEntry;
      }

    // a bit of TypeScript gymnastics to let callers easily infer the value
    // type if no special report is delivered at the end of the stream
    | (TReport extends null
        ? never
        : {
            done: true;
            value: TReport;
          })
  > {
    const reader = this.#readStream.getReader();

    let buffer = "";
    let result: ReadableStreamReadResult<Uint8Array> | undefined;

    while (!(result = await reader.read()).done) {
      buffer += this.#decoder.decode(result.value);

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
            yield {
              done: false,
              value: this.#wires.entry.decode(value[0]),
            } as const;

            // slice the buffer, so that the previously emitted value is no
            // longer retained in-memory
            buffer = buffer.slice(value[1]);
          } else {
            if (this.#wires.report) {
              // if we get here, the final response has been received - emit it
              // in it's entirety
              yield {
                done: true,
                value: this.#wires.report.decode(value[0]),
              } as TReport extends null
                ? never
                : {
                    done: true;
                    value: TReport;
                  };
            }

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
}
