import type { Logger } from "@direct.dev/shared";

import type { BatchConfig, DirectRPCBatch } from "./batch.core.js";
import { DirectRPCDuplexFetchBatch } from "./batch.duplex-fetch.js";
import { DirectRPCFetchBatch } from "./batch.fetch.js";

/**
 * utility to create a new DirectRPCBatch using the most optimal transport
 * supported by the user's browser.
 */
export function createBatch(config: BatchConfig & { isHttps: boolean }, logger: Logger): DirectRPCBatch {
  return supportsFetchDuplex.current === true && config.isHttps
    ? new DirectRPCDuplexFetchBatch(config, logger)
    : new DirectRPCFetchBatch(config, logger);
}

/**
 * feature checker, to review if the browser supports using `duplex: half`
 */
const supportsFetchDuplex = {
  current: false,
};

(async () => {
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
    if (req.duplex !== "half") {
      return false;
    }

    // mock a fetch request with duplex: half to ensure that the browser
    // actually supports streaming and no browser extensions will interrupt
    // support (as is the case with e.g. Requestly)
    return fetch("data:a/a;charset=utf-8,", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue("duplex");
          controller.close();
        },
      }),

      // @ts-expect-error: duplex is not yet included in TypeScript
      // definitions for Response
      duplex: "half",
    }).then(
      () => true,
      () => false,
    );
  } catch {
    return false;
  }
})().then((result) => {
  supportsFetchDuplex.current = result;
});
