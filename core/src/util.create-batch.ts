import type { Logger } from "@direct.dev/shared";

import type { BatchConfig, DirectRPCBatch } from "./batch.core.js";
import { DirectRPCFetchBatch } from "./batch.fetch.js";

/**
 * utility to create a new DirectRPCBatch using the most optimal transport
 * supported by the user's browser.
 */
export function createBatch(config: BatchConfig, logger: Logger): DirectRPCBatch {
  return new DirectRPCFetchBatch(config, logger);
}
