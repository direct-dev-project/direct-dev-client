import type {
  DirectRPCErrorResponse,
  DirectRPCHead,
  DirectRPCRequest,
  DirectRPCSuccessResponse,
  Logger,
} from "@direct.dev/shared";
import { makeGeneratorFromNDJson, PushableAsyncGenerator } from "@direct.dev/shared";
import { WireDecodeStream, wire, WireEncodeStream } from "@direct.dev/wire";

import { isDirectHead, isRpcErrorResponse, isRpcSuccessResponse } from "./guards.js";

export type BatchConfig = {
  /**
   * session ID associated with the client creating this batch.
   */
  sessionId: string;

  /**
   * specifies the Direct.dev endpoint, which this batch should be transmitted
   * to.
   */
  endpointUrl: string;

  /**
   * if enabled, then data will be transmitted to Direct.dev using NDJSON
   * rather than Wire
   *
   * @default false
   */
  preferJSON: boolean | undefined;
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
  #requests = new PushableAsyncGenerator<DirectRPCRequest>();

  constructor(config: BatchConfig, logger: Logger) {
    this.logger = logger;

    if (!config.preferJSON) {
      // by default we use a WireStream and encode content using the
      // appropriate Wire packers
      const wireStream = new WireEncodeStream();

      (async () => {
        await wireStream.pushHead(wire.requestHead.encode(config));

        let result: IteratorResult<DirectRPCRequest, wire.RequestTail>;
        do {
          result = await this.#requests.next();

          if (result.done) {
            await wireStream.pushTail(wire.requestTail.encode(result.value), { compress: isCompressionSupported });
            break;
          }

          await wireStream.pushItem(wire.RPCRequest.encode(result.value), { compress: isCompressionSupported });
        } while (!result.done);

        wireStream.close();
      })();

      this.bodyStream = wireStream;
    } else {
      // if we're using NDJSON, then create a plain NDJSON stream and manually
      // encode requests as they are being pushed to the batch
      const encoder = new TextEncoder();

      this.bodyStream = new ReadableStream({
        start: async (controller) => {
          // push the head as the first entry on the stream
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "head", value: { sessionId: config.sessionId } }) + "\n"),
          );

          let result: IteratorResult<DirectRPCRequest, wire.RequestTail>;

          do {
            result = await this.#requests.next();

            if (result.done) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "tail", value: result.value }) + "\n"));
              break;
            }

            controller.enqueue(encoder.encode(JSON.stringify({ type: "item", value: result.value }) + "\n"));
          } while (!result.done);

          controller.close();
        },
      });
    }

    this.config = config;
  }

  /**
   * indicates the current number of requests pushed onto this batch
   */
  get size(): number {
    return this.#requests.size;
  }

  /**
   * retrives the array of requests currently pushed onto this batch.
   *
   * @note this returns a snapshot of the requests generator at the time of
   *       calling, it will not reflect values pushed afterwards.
   */
  get requests(): Promise<DirectRPCRequest[]> {
    return this.#requests.toArray(this.#requests.size);
  }

  /**
   * add the request to the batch, writing it to the wire stream so that it
   * will be sent to the upstream server as soon as possible.
   */
  push(req: DirectRPCRequest): void {
    this.#requests.push({
      ...req,

      // re-map ids of requests, so that they're equal to the index of the
      // request in the batch list (this is useful when receiving responses as
      // it allows us to quickly identify the associated request hash and
      // resolve the correct inflight promise)
      id: this.#requests.size + 1,
    });
  }

  /**
   * dispatch the requests to the Direct.dev infrastructure, using the content
   * encoded on the Wirestream to transmit the message.
   */
  async dispatch(
    metrics: wire.RequestTail,
  ): Promise<
    | AsyncGenerator<
        | { type: "head"; value: DirectRPCHead }
        | { type: "item"; value: DirectRPCSuccessResponse | DirectRPCErrorResponse }
      >
    | undefined
  > {
    try {
      // close the request stream, to ensure that the body stream resolves
      // correctly
      this.#requests.close(metrics);

      const res = await this.fetch();
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

      if (!this.config.preferJSON) {
        // if we're using the default Wire format, then use a WireDecodeStream
        // to yield values
        return new WireDecodeStream(resBody).getReader({
          head: (input) => wire.responseHead.decode(input)[0],
          item: (input) => wire.RPCResponse.decode(input)[0],
          tail: () => null, // tails are never used, ignore them completely
        });
      } else {
        return (async function* parse() {
          for await (const segment of makeGeneratorFromNDJson(resBody)) {
            const typedSegment = segment as
              | { type: "head"; value: DirectRPCHead }
              | { type: "item"; value: DirectRPCSuccessResponse | DirectRPCErrorResponse };

            switch (typedSegment.type) {
              case "item":
                if ("expiresAt" in typedSegment.value && typedSegment.value.expiresAt) {
                  // mimic wire behaviour, making sure to convert dates back to
                  // Date objects
                  typedSegment.value.expiresAt = new Date(typedSegment.value.expiresAt);
                }

                if (!isRpcSuccessResponse(typedSegment.value) && !isRpcErrorResponse(typedSegment.value)) {
                  throw new Error("DirectRPCBatch.dispatch: received invalid response structure");
                }
                break;

              case "head":
                if ("blockHeightExpiresAt" in typedSegment.value && typedSegment.value.blockHeightExpiresAt) {
                  // mimic wire behaviour, making sure to convert dates back
                  // to Date objects
                  typedSegment.value.blockHeightExpiresAt = new Date(typedSegment.value.blockHeightExpiresAt);
                }

                if (!isDirectHead(typedSegment.value)) {
                  throw new Error("DirectRPCBatch.dispatch: received invalid head structure");
                }
                break;
            }

            yield typedSegment;
          }
        })();
      }
    } catch (err) {
      this.logger.error("Batch.dispatch", "fetch failed", { err });
      return undefined;
    }
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

// feature-detect whether or not compression is supported by the user's browser
const isCompressionSupported = (() => {
  try {
    return typeof CompressionStream === "function" && new CompressionStream("gzip") instanceof CompressionStream;
  } catch {
    return false;
  }
})();
