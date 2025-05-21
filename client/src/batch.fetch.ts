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
      body: await new Response(this.bodyStream).blob(),
      headers: !this.config.preferJSON
        ? {
            "Content-Type": "application/octet-stream",
          }
        : {
            "Content-Type": "text/plain",
          },
    });
  }
}
