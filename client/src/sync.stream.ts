import { makeGeneratorFromNDJson, type Logger } from "@direct.dev/shared";
import { isCompressionSupported, wire, WIRE_VERSION_ID, WireDecodeStream } from "@direct.dev/wire";

import { AVG_HTTP_REQUEST_HEADER_SIZE, AVG_HTTP_RESPONSE_HEADER_SIZE } from "./constants.js";
import { rpcResponseSchema, syncEventSchema, syncHeadSchema } from "./schemas.js";

type Config = {
  sessionId: string;
  endpointUrl: string;
  preferredFormat: "wire" | "ndjson";
};

/**
 * integration of a sync request, which creates a long-poll connection to
 * Direct.dev infrastructure to facilitate live state synchronization with
 * local client.
 */
export class DirectSyncStream {
  #logger: Logger;
  #config: Config;

  /**
   * abort controller used to terminate stream, when instructed by the manager.
   */
  #abortController = new AbortController();

  /**
   * reference to event handlers bound to this stream, so events can be emitted
   * externally
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #eventHandlers = new Map<string, (data?: any) => void>();

  /**
   * specifies if this stream has been stopped
   */
  #isStopped = false;

  constructor(logger: Logger, config: Config) {
    this.#logger = logger;
    this.#config = config;
  }

  /**
   * establish the synchronization stream, optionally requesting a primer
   * package to ensure client is brought fully up-to-date
   */
  start(primer: wire.SyncRequest["primer"] | undefined, telemetry: wire.TelemetryStructure | undefined) {
    const reqBody = this.#buildRequestBody(primer, telemetry);

    // emit upload bandwidth consumption
    this.#emit("bandwidth", {
      upload: reqBody.length + AVG_HTTP_REQUEST_HEADER_SIZE,
      download: AVG_HTTP_RESPONSE_HEADER_SIZE,
    });

    // build the URL for the request, including configurations
    const urlParams = new URLSearchParams();

    if (!isCompressionSupported()) {
      urlParams.set("u", "1");
    }

    const urlParamsStr = urlParams.toString();
    const url = urlParamsStr ? this.#config.endpointUrl + "?" + urlParamsStr : this.#config.endpointUrl;

    // open the stream
    fetch(url, {
      method: "POST",
      body: reqBody,
      headers: {
        "Content-Type": this.#config.preferredFormat === "ndjson" ? "text/plain" : "application/octet-stream",
      },
      signal: this.#abortController.signal,
    })
      .then(async (res) => {
        if (this.#isStopped) {
          return;
        }

        if (!res.ok) {
          throw new Error("server error occurred");
        }

        if (!res.body) {
          throw new Error("no response body received");
        }

        // notify the manager that this connection is now open, so it can take
        // over the responsibility of delivering state syncing
        this.#emit("open");

        // read response stream and emit data as it is being received from the
        // client
        let emittedBandwidthBytes = 0;

        if (this.#config.preferredFormat === "ndjson") {
          const byteSize = {
            readBytes: 0,
          };

          try {
            for await (const segment of makeGeneratorFromNDJson(res.body, byteSize)) {
              this.#emit("bandwidth", { upload: 0, download: Math.max(0, byteSize.readBytes - emittedBandwidthBytes) });
              emittedBandwidthBytes = byteSize.readBytes;

              const typedSegment = segment as
                | { type: "head"; value: wire.SyncHead }
                | { type: "item"; value: wire.RPCResponseStructure }
                | { type: "tail"; value: wire.SyncEventStructure };

              switch (typedSegment.type) {
                case "tail":
                  this.#emit("event", syncEventSchema(typedSegment.value));
                  break;

                case "item":
                  this.#emit("item", rpcResponseSchema(typedSegment.value));
                  break;

                case "head":
                  this.#emit("head", syncHeadSchema(typedSegment.value));
                  break;
              }
            }
          } finally {
            this.#emit("bandwidth", { upload: 0, download: Math.max(0, byteSize.readBytes - emittedBandwidthBytes) });
          }

          return;
        }

        // if we get here, data was sent in Wire-encoding, use a basic reader
        // and emit corresponding events
        const decodeStream = new WireDecodeStream(res.body);

        try {
          for await (const segment of decodeStream.getReader({
            head: (input) => syncHeadSchema(wire.syncHead.decode(input)[0]),
            item: (input) => rpcResponseSchema(wire.RPCResponse.decode(input)[0]),
            tail: (input) => syncEventSchema(wire.syncEvent.decode(input)[0]),
          })) {
            this.#emit("bandwidth", {
              upload: 0,
              download: Math.max(0, decodeStream.sizeInBytes - emittedBandwidthBytes),
            });
            emittedBandwidthBytes = decodeStream.sizeInBytes;

            switch (segment.type) {
              case "tail":
                this.#emit("event", segment.value);
                break;

              case "item":
                this.#emit("item", segment.value);
                break;

              case "head":
                this.#emit("head", segment.value);
                break;
            }
          }
        } finally {
          this.#emit("bandwidth", {
            upload: 0,
            download: Math.max(0, decodeStream.sizeInBytes - emittedBandwidthBytes),
          });
        }
      })
      .then(() => {
        // emit a close event to allow handling scenarios where Direct.dev
        // infrastructure closed the stream
        this.#emit("close");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          // silently ignore abort errors; they occur when we roll connections
          return;
        }

        this.#logger.error("DirectSyncStream", "an error occurred while connecting to Direct.dev infrastructure", {
          err,
        });

        // notify the manager of the error, so it can re-try the connection
        // again shortly
        this.#emit("error", err);
      });
  }

  /**
   * internal helper to build request body based on preferred format, so that
   * it can correctly be transmitted to Direct.dev infrastructure
   */
  #buildRequestBody(
    primer: wire.SyncRequest["primer"] | undefined,
    telemetry: wire.TelemetryStructure | undefined,
  ): string {
    if (this.#config.preferredFormat === "ndjson") {
      return JSON.stringify({
        wireVersion: WIRE_VERSION_ID,
        sessionId: this.#config.sessionId,
        primer: primer
          ? {
              knownResponses: Array.from(primer.knownResponses),
            }
          : undefined,
        telemetry,
      });
    }

    return (
      String.fromCharCode(WIRE_VERSION_ID) +
      wire.syncRequest.encode({
        sessionId: this.#config.sessionId,
        telemetry,
        primer,
      })
    );
  }

  /**
   * bind a callback to an event
   *
   * @note only one callback can be bound to a given event at any given time.
   */
  on(eventName: "open" | "close", cb: () => void): void;
  on(eventName: "error", cb: (err: unknown) => void): void;
  on(eventName: "head", cb: (data: wire.SyncHead) => void): void;
  on(eventName: "item", cb: (data: DirectRPCResultResponse) => void): void;
  on(eventName: "event", cb: (data: wire.SyncEventStructure) => void): void;
  on(eventName: "bandwidth", cb: (data: { download: number; upload: number }) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(eventName: string, cb: (data?: any) => void): void {
    this.#eventHandlers.set(eventName, cb);
  }

  /**
   * abort the connection, so we stop fetching additional data once this line
   * has been fully opened
   */
  stop() {
    if (this.#isStopped) {
      return;
    }

    this.#isStopped = true;
    this.#abortController.abort();
  }

  /**
   * utility to trigger event handlers in response to received events.
   */
  #emit(eventName: "open" | "close"): void;
  #emit(eventName: "error", err: unknown): void;
  #emit(eventName: "head", data: wire.SyncHead): void;
  #emit(eventName: "item", data: DirectRPCResultResponse | DirectRPCErrorResponse): void;
  #emit(eventName: "event", data: wire.SyncEventStructure): void;
  #emit(eventName: "bandwidth", data: { download: number; upload: number }): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #emit(eventName: string, data?: any): void {
    if (this.#isStopped) {
      // prevent emitting events after having stopped the stream
      return;
    }

    this.#eventHandlers.get(eventName)?.(data);
  }
}
