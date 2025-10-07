import type { LogLevel } from "./typings.js";

/**
 * Ranking of log levels for fast checking if log level is enabled or not.
 */
export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  verbose: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 70,
};
