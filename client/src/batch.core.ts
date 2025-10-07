import type { Logger } from "@direct.dev/shared";
import { makeGeneratorFromNDJson, PushableAsyncGenerator } from "@direct.dev/shared";
import { WireDecodeStream, wire, WireEncodeStream, isCompressionSupported } from "@direct.dev/wire";

import { AVG_GZIP_COMPRESSION } from "./constants.js";
import { rpcHeadSchema, rpcResponseSchema } from "./schemas.js";

export type BatchConfig = {
  /**
   * session ID associated with the client creating this batch.
   */
  sessionId: string;

  /**
   * optionally lock the batch to a specific block height.
   */
  blockHeight: MaybePromise<RPCBlockHeight | undefined>;

  /**
   * specifies the Direct.dev endpoint, which this batch should be transmitted
   * to.
   */
  endpointUrl: string;

  /**
   * specifies if the client is running within an HTTPS context, used to
   * determine if batch streams are supported.
   */
  isHttps: boolean;

  /**
   * specifies the preferred format used for data exchange between client and
   * Direct.dev infrastructure.
   */
  preferredFormat: "wire" | "ndjson" | "jsonrpc";
};

export type BatchRequest = {
  requestBody: DirectRPCRequest;
  requestKey: DirectCacheKey | undefined;
};

/**
 * Direct batches RPC requests, attempting to run as many requests as possible
 * through a single HTTP request as possible
 *
 * This implementation defines the core interface for creating and handling
 * batches in a duplex-streaming compatible fashion, allowing implementation of
 * multiple possible transport layers depending on browser capabilities.
 *
 * Ideally we'd use WebTransport for full-duplex communication, but at the time
 * of writing (22-03-2025) Cloudflare unfortunately has not yet added
 * WebTransport support to Cloudflare Workers.
 *
 * Instead we rely on fetch using half-duplex support in browsers that support
 * it to allow streaming requests to the server while a batch window is open,
 * and then streaming responses back after the window closes.
 *
 * For legacy browsers we fall back to regular fetch requests.
 */
export abstract class DirectRPCBatch {
  /**
   * reference to the configuration given when creating the batch
   */
  protected config: BatchConfig;

  /**
   * reference to the logger instance provided when creating this batch
   */
  protected logger: Logger;

  /**
   * internal reference to the request body stream, which requests are written
   * to during the batch window to allow transmitting data in duplex.
   */
  protected bodyStream: ReadableStream;

  /**
   * the current number of requests that have been pushed to the upload stream.
   */
  #requests = new PushableAsyncGenerator<BatchRequest>();

  /**
   * in-memory buffering of all requests pushed to this batched, so they can be
   * referenced in case
   */
  #requestBuffer: BatchRequest[] = [];

  /**
   * in-memory state, representing the total number of bytes written onto the
   * upload stream.
   */
  #uploadSizeInBytes = 0;

  /**
   * abort controller used to terminate requests in case of timeouts, so that
   * network ressources are not needlessly wasted.
   */
  #abortController = new AbortController();

  constructor(config: BatchConfig, logger: Logger) {
    this.logger = logger;

    this.#requests.tap((it) => {
      this.#requestBuffer.push(it);
    });

    switch (config.preferredFormat) {
      case "ndjson":
        {
          // if we're using NDJSON, then create a plain NDJSON stream and
          // manually encode requests as they are being pushed to the batch
          const encoder = new TextEncoder();

          this.bodyStream = new ReadableStream({
            start: async (controller) => {
              // internal helper to push data to the stream, while updating byte
              // length in-memory
              const write = (data: string) => {
                const buffer = encoder.encode(data);

                controller.enqueue(buffer);
                this.#uploadSizeInBytes += buffer.byteLength;
              };

              // push the head as the first entry on the stream
              const headPromise = (async () => {
                write(
                  JSON.stringify({
                    type: "head",
                    value: {
                      sessionId: config.sessionId,
                      blockHeight: await config.blockHeight,
                    } satisfies wire.RequestHead,
                  }) + "\n",
                );
              })();

              for await (const item of this.#requests) {
                write(JSON.stringify({ type: "item", value: item.requestBody }) + "\n");
              }

              await headPromise;

              controller.close();
            },
          });
        }
        break;

      case "jsonrpc":
        {
          // if we're using vanilla JSON-RPC, then create a text stream and
          // manually encode as batch-calls
          const encoder = new TextEncoder();

          this.bodyStream = new ReadableStream({
            start: async (controller) => {
              // internal helper to push data to the stream, while updating byte
              // length in-memory
              const write = (data: string) => {
                const buffer = encoder.encode(data);

                controller.enqueue(buffer);
                this.#uploadSizeInBytes += buffer.byteLength;
              };

              // open the batch initially
              write("[");

              // iterate over all incoming requets, and write all regular
              // requests onto the
              let isFirstRequest = true;
              for await (const item of this.#requests) {
                write((isFirstRequest ? "" : ",") + JSON.stringify(item.requestBody));
                isFirstRequest = false;
              }

              // close the batch
              write("]");

              controller.close();
            },
          });
        }
        break;

      default: {
        // by default we use a WireStream and encode content using the
        // appropriate Wire packers
        const wireStream = new WireEncodeStream();

        (async () => {
          const headPromise = (async () => {
            await wireStream.pushHead(
              wire.requestHead.encode({
                sessionId: config.sessionId,
                supportsCompression: isCompressionSupported(),
                blockHeight: await config.blockHeight,
              }),
            );

            this.#uploadSizeInBytes = wireStream.sizeInBytes;
          })();

          for await (const item of this.#requests) {
            await wireStream.pushItem(wire.RPCRequest.encode(item.requestBody), {
              compress: true,
            });
            this.#uploadSizeInBytes = wireStream.sizeInBytes;
          }

          await headPromise;

          wireStream.close();
        })();

        this.bodyStream = wireStream;
      }
    }

    this.config = config;
  }

  /**
   * indicates the current number of requests pushed onto this batch
   */
  get length(): number {
    return this.#requests.size;
  }

  /**
   * indicates the total byte size of data written onto this batch.
   */
  get sizeInBytes(): number {
    return this.#uploadSizeInBytes;
  }

  /**
   * retrives the array of requests currently pushed onto this batch.
   *
   * @note this returns a snapshot of the requests generator at the time of
   *       calling, it will not reflect values pushed afterwards.
   */
  get requests(): BatchRequest[] {
    return this.#requestBuffer;
  }

  /**
   * add the request to the batch, writing it to the wire stream so that it
   * will be sent to the upstream server as soon as possible.
   */
  push(req: BatchRequest): void {
    this.#requests.push(req);
  }

  /**
   * dispatch the requests to the Direct.dev infrastructure, using the content
   * encoded on the Wirestream to transmit the message.
   */
  async dispatch(): Promise<
    | AsyncGenerator<
        | { type: "head"; value: DirectRPCHead }
        | { type: "item"; value: DirectRPCResultResponse | DirectRPCErrorResponse }
        | { type: "tail"; value: { upload: number; download: number } }
      >
    | undefined
  > {
    try {
      // close the request stream, to ensure that the body stream resolves
      // correctly
      this.#requests.close(null);

      // abort request if we do not get a response within defined threshold
      let abortTimeout = setTimeout(() => {
        this.#abortController.abort();
      }, 1500);

      const res = await this.fetch();
      const uploadSizeInBytes = this.#uploadSizeInBytes;
      const resBody = res.body;

      // something went wrong in the Direct.dev layer, restore state and
      // perform fail-over
      if (!res.ok || !resBody) {
        this.logger.error("FetchBatch", "internal server error occurred", {
          res: {
            status: res.status,
            statusText: res.statusText,
            body: await res.text(),
          },
        });

        return undefined;
      }

      // after having received initial response, re-schedule abortion to allow
      // up to 500ms for server to indicate liveness
      clearTimeout(abortTimeout);

      abortTimeout = setTimeout(() => {
        this.#abortController.abort();
      }, 500);

      switch (this.config.preferredFormat) {
        case "jsonrpc":
          // clear abort timeout, liveness can only be inferred from HTTP
          // handshake in regular JSON-RPC format
          clearTimeout(abortTimeout);

          // for vanilla JSONRPC, we cannot stream responses - wait for entire
          // response body, parse it and yield items individually
          return (async function* parse() {
            const responseText = await res.text();
            const response = JSON.parse(responseText);

            if (!Array.isArray(response)) {
              throw new Error("DirectRPCBatch.dispatch: received invalid response body, not an array");
            }

            for (const item of response) {
              yield { type: "item", value: rpcResponseSchema(item) };
            }

            yield {
              type: "tail",
              value: {
                upload: uploadSizeInBytes,
                download: responseText.length * (1 - AVG_GZIP_COMPRESSION),
              },
            };
          })();

        case "ndjson":
          // for NDJSON stream the response and yield each line as it's own
          // segment
          return (async function* parse() {
            const byteSize = { readBytes: 0 };

            for await (const segment of makeGeneratorFromNDJson(resBody, byteSize)) {
              // clear abort timeout, liveness has been proved as a
              // response was received
              clearTimeout(abortTimeout);

              const typedSegment = segment as
                | { type: "head"; value: DirectRPCHead }
                | { type: "item"; value: DirectRPCResultResponse | DirectRPCErrorResponse };

              switch (typedSegment.type) {
                case "item":
                  yield { type: "item", value: rpcResponseSchema(typedSegment.value) };
                  break;

                case "head": {
                  yield { type: "head", value: rpcHeadSchema(typedSegment.value) };
                  break;
                }
              }
            }

            yield {
              type: "tail",
              value: {
                upload: uploadSizeInBytes,
                download: byteSize.readBytes,
              },
            };
          })();

        default:
          return (async function* parse() {
            // if we're using the default Wire format, then use a
            // WireDecodeStream to yield values
            const decodeStream = new WireDecodeStream(resBody);

            for await (const segment of decodeStream.getReader({
              head: (input) => rpcHeadSchema(wire.responseHead.decode(input)[0]),
              item: (input) => {
                // slight CPU overhead (~0,01-0,05ms pr. response object),
                // ensuring that responses decoded through the Wire protocol
                // will have identical structure to responses decoded through
                // regular JSON
                //
                // namely, this ensures that "undefined" optional properties are
                // omitted in the emitted object, whereas Wire will include them
                // as undefined values
                const entry = wire.RPCResponse.decode(input)[0];

                return rpcResponseSchema(JSON.parse(JSON.stringify(entry)));
              },
              tail: () => null, // tails are never used, ignore them completely
            })) {
              // clear abort timeout, liveness has been proved as a response
              // was received
              clearTimeout(abortTimeout);

              yield segment;
            }

            yield {
              type: "tail",
              value: {
                upload: uploadSizeInBytes,
                download: decodeStream.sizeInBytes,
              },
            };
          })();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        this.logger.warn("DirectRPCBatch.dispatch", "request was aborted due to connection timeout");
      } else {
        this.logger.error("DirectRPCBatch.dispatch", "fetch failed", { err });
      }

      return undefined;
    }
  }

  /**
   * returns a reference to the abortSignal which should be applied when
   * calling fetch, so requests can be terminated if timeouts are reached.
   */
  protected getAbortSignal(): AbortSignal {
    return this.#abortController.signal;
  }

  /**
   * implement a fetch callback, which transmits the stream to the Direct.dev
   * infrastructure using the best possible means supported for the browser
   * (full-duplex with WebTransport once possible in Cloudflare, half-duplex
   * with fetch in supported browsers and non-duplex fallback for other
   * browsers).
   */
  protected abstract fetch(): Promise<Response>;
}
