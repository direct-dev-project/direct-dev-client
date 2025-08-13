import { DirectRPCBatch } from "./batch.core.js";

/**
 * Legacy implementation of a default fetch call to connect with Direct.dev,
 * sending all requests in a single chunk to the server and then allowing
 * streaming of responses as they become available.
 */
export class DirectRPCFetchBatch extends DirectRPCBatch {
  protected async fetch() {
    //
    // STEP: perform the request against the upstream, and return the response
    // body stream to allow the client to emit responses as soon as they become
    // available
    //
    return fetch(this.config.endpointUrl, {
      method: "POST",
      signal: this.getAbortSignal(),
      body: await new Response(this.bodyStream).blob(),
      headers: {
        "Content-Type": (() => {
          switch (this.config.preferredFormat) {
            case "jsonrpc":
              return "application/json";

            case "ndjson":
              return "text/plain";

            default:
              return "application/octet-stream";
          }
        })(),
      },
    });
  }
}
