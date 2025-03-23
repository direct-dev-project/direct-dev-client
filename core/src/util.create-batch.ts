import type { Logger } from "@direct.dev/shared";

import type { BatchConfig, DirectRPCBatch } from "./batch.core.js";
import { DirectRPCDuplexFetchBatch } from "./batch.duplex-fetch.js";
import { DirectRPCFetchBatch } from "./batch.fetch.js";

/**
 * utility to create a new DirectRPCBatch using the most optimal transport
 * supported by the user's browser.
 */
export function createBatch(config: BatchConfig & { isHttps: boolean }, logger: Logger): DirectRPCBatch {
  return supportsFetchDuplexHalf && config.isHttps
    ? new DirectRPCDuplexFetchBatch(config, logger)
    : new DirectRPCFetchBatch(config, logger);
}

/**
 * feature checker, to review if the browser supports using `duplex: half`
 */
const supportsFetchDuplexHalf = (() => {
  try {
    const req = new Request("", {
      method: "POST",
      body: new ReadableStream(),

      // @ts-expect-error: duplex is not yet included in TypeScript
      // definitions for Response
      duplex: "half",
    });

    // @ts-expect-error: duplex is not yet included in TypeScript
    // definitions for Response
    return req.duplex === "half";
  } catch {
    return false;
  }
})();
