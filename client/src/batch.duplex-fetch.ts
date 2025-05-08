import type { Logger } from "@direct.dev/shared";

import type { BatchConfig } from "./batch.core.js";
import { DirectRPCBatch } from "./batch.core.js";

/**
 * Implementation of half-duplex fetch calls to Direct.dev, which allows
 * streaming requests to the backend while a batch window is still open.
 */
export class DirectRPCDuplexFetchBatch extends DirectRPCBatch {
  /**
   * reference to the response stream which is created initially when the batch
   * is created, so that we can upload
   */
  #res: Promise<Response>;

  constructor(config: BatchConfig, logger: Logger) {
    super(config, logger);

    this.#res = fetch(this.config.endpointUrl, {
      method: "POST",
      body: this.bodyStream,
      headers: !config.preferJSON
        ? {
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "identity",
          }
        : {
            "Content-Type": "application/x-ndjson",
          },

      // @ts-expect-error: TypeScript doesn't include support for duplex in
      // fetch API yet
      duplex: "half",
    });
  }

  /**
   * simply return the request we opened when the batch was created
   */
  protected async fetch() {
    return this.#res;
  }
}
