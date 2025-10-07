import type { HighResTimestamp } from "./typings.js";

/**
 * convenience utility to generate high-resolution timestamp, which is
 * compatible with OTLP
 *
 * @note we're currently intentionally not increasing resolution, but just
 *       using the milliseconds resolution natively available from Date.now() -
 *       there are no good ways within Cloudflare's environment to get
 *       consistent high-res timestamps.
 */
export function now(): HighResTimestamp {
  return String(Date.now() * 1_000_000) as HighResTimestamp;
}
