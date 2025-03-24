import type {
  DirectRPCErrorResponse,
  DirectRPCHead,
  DirectRPCRequest,
  DirectRPCSuccessResponse,
  Logger,
} from "@direct.dev/shared";
import { WireDecodeStream, wire, WireEncodeStream } from "@direct.dev/wire";

export type BatchConfig = {
  /**
   * specifies the Direct.dev endpoint, which this batch should be transmitted
   * to.
   */
  endpointUrl: string;
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
  config: BatchConfig;

  /**
   * reference to the logger instance provided when creating this batch
   */
  logger: Logger;

  /**
   * internal reference to the Wire stream created to auto-encode RPC requests
   * for blazingly fast transmission
   */
  wireStream = new WireEncodeStream();

  /**
   * the current number of requests that have been pushed to the upload stream.
   */
  requests: DirectRPCRequest[] = [];

  constructor(config: BatchConfig, logger: Logger) {
    this.logger = logger;
    this.wireStream = new WireEncodeStream();

    this.config = config;
  }

  /**
   * add the request to the batch, writing it to the wire stream so that it
   * will be sent to the upstream server as soon as possible.
   */
  add(req: DirectRPCRequest): void {
    this.wireStream.push(
      wire.RPCRequest.encode({
        ...req,

        // re-map ids of requests, so that they're equal to the index of the
        // request in the batch list (this is useful when receiving responses as
        // it allows us to quickly identify the associated request hash and
        // resolve the correct inflight promise)
        id: this.requests.length + 1,
      }),
    );
    this.requests.push(req);
  }

  /**
   * dispatch the requests to the Direct.dev infrastructure, using the content
   * encoded on the Wirestream to transmit the message.
   */
  async dispatch(
    metrics: wire.ClientMetrics,
  ): Promise<
    | AsyncGenerator<{ done: boolean; value: DirectRPCHead | DirectRPCSuccessResponse | DirectRPCErrorResponse }>
    | undefined
  > {
    try {
      this.wireStream.close(wire.clientMetrics.encode(metrics));

      const res = await this.fetch();

      // something went wrong in the Direct.dev layer, restore state and
      // perform fail-over
      if (!res.ok || !res.body) {
        this.logger.error(
          "FetchBatch",
          "internal server error occurred (%s %s):\n\n%s",
          res.status,
          res.statusText,
          await res.text(),
        );

        return undefined;
      }

      return new WireDecodeStream(res.body).getReader((input) => {
        // slight CPU overhead (~0,01-0,05ms pr. response object), ensuring
        // that responses decoded through the Wire protocol will have identical
        // structure to responses decoded through regular JSON
        //
        // namely, this ensures that "undefined" optional properties are
        // omitted in the emitted object, whereas Wire will include them as
        // undefined values
        return JSON.parse(JSON.stringify(wire.RPCResponse.decode(input)[0]));
      });
    } catch (err) {
      this.logger.error("Batch.dispatch", "fetch failed", err);
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
  abstract fetch(): Promise<Response>;
}
