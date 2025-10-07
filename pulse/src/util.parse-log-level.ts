import { checkpoint, check } from "@direct.dev/checkpoint";

import { LOG_LEVEL_RANK } from "./constants.js";
import type { LogLevel } from "./typings.js";

/**
 * Parsed configuration of log level to apply
 */
export type ParsedLogLevel = {
  /**
   * Default level to apply, if not overwritten by specific traces.
   */
  default: LogLevel;

  /**
   * Overrides of level by specific traces.
   */
  byTrace: Record<string, LogLevel>;
};

/**
 * Parses provided logLevel pattern, and infers levels based on origin and
 * trace.
 *
 * Supported tokens:
 *   - wildcard: "*:<level>"
 *   - by origin: "origin:<selector>:<level>"
 *   - by trace: "trace:<selector>:<level>"
 *
 * @example pattern input
 * ```text
 * *:info trace:block-height-change:debug origin:rpc.revalidator:debug
 * ```
 */
export function parseLogLevel(input: string, originPath: string): ParsedLogLevel {
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  const byTrace: Record<string, LogLevel> = {};
  const fallback: {
    wildcard: LogLevel;
    origin:
      | undefined
      | {
          specificity: number;
          level: LogLevel;
        };
  } = {
    wildcard: "silent",
    origin: undefined,
  };

  for (const token of tokens) {
    const parts = token.split(":");
    const level = logLevelSchema(parts.at(-1));

    switch (parts[0]) {
      case "*": {
        if (parts.length !== 2) {
          throw new Error(`parseLogLevel: invalid token "${token}"`);
        }

        fallback.wildcard = level;
        break;
      }

      case "origin": {
        if (parts.length !== 3) {
          throw new Error(`parseLogLevel: invalid token "${token}"`);
        }

        if (parts[1] && originPath.startsWith(parts[1])) {
          if (!fallback.origin || parts[1].length >= fallback.origin.specificity) {
            // apply origin fallback if it's more specific than already
            // collected configuration
            fallback.origin = {
              specificity: parts[1].length,
              level,
            };
          }
        }
        break;
      }

      case "trace": {
        if (parts.length !== 3) {
          throw new Error(`parseLogLevel: invalid token "${token}"`);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        byTrace[parts[1]!] = level;
        break;
      }

      default:
        throw new Error(`parseLogLevel: invalid token "${token}"`);
    }
  }

  // iterate over all traces, and ensure that they do not increase level as
  // compared to specific origin configuration
  const defaultLevel = fallback.origin?.level ?? fallback.wildcard;
  const defaultRank = LOG_LEVEL_RANK[defaultLevel];

  return {
    default: defaultLevel,
    byTrace: Object.fromEntries(
      Object.entries(byTrace).filter(([, traceLevel]) => {
        return LOG_LEVEL_RANK[traceLevel] > defaultRank;
      }),
    ),
  };
}

const logLevelSchema = checkpoint(
  "logLevel",
  check.literal<LogLevel>("verbose", "debug", "info", "warn", "error", "fatal", "silent"),
);
