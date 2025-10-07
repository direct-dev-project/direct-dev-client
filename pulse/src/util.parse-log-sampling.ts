import { checkpoint, check } from "@direct.dev/checkpoint";

import type { LogLevel } from "./typings.js";

/**
 * Parsed configuration of log sampling for all levels, values ranging from 0
 * (nothing is sampled) to 1 (everything is sampled).
 */
export type ParsedLogSampling = Record<
  Exclude<LogLevel, "silent">,
  {
    /**
     * Default sampling factor to apply, if not overwritten by specific
     * traces.
     */
    default: number;

    /**
     * Overrides of sampling by specific traces.
     */
    byTrace: Record<string, number>;
  }
>;

/**
 * Parses provided log sampling pattern, and infers factors by log level,
 * origin and trace.
 *
 * Supported tokens:
 *   - wildcard: "*:<factor>"
 *   - per-level: "level:<level>:<factor>"
 *   - by origin: "origin:<selector>:<factor>"
 *   - by trace: "trace:<selector>:<factor>"
 *
 * @example pattern input
 * ```text
 * *:0 level:error:1 level:warn:0.2 level:info:0.01 origin:rpc.mirror:1 trace:revalidate:1
 * ```
 */
export function parseLogSampling(input: string, originPath: string): ParsedLogSampling {
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  //
  // STEP: parse and prepare global configurations, for subsequent per-level
  // parsing
  //
  const byTrace: Record<string, number> = {};
  const byLevel: Partial<Record<Exclude<LogLevel, "silent">, number>> = {};
  const fallback: {
    wildcard: number;
    origin:
      | undefined
      | {
          specificity: number;
          factor: number;
        };
  } = {
    wildcard: 0,
    origin: undefined,
  };

  for (const token of tokens) {
    const parts = token.split(":");
    const factor = parseFactor(parts.at(-1) ?? "");

    switch (parts[0]) {
      case "*": {
        if (parts.length !== 2) {
          throw new Error(`parseLogSampling: invalid token "${token}"`);
        }

        fallback.wildcard = factor;
        break;
      }

      case "origin": {
        if (parts.length !== 3) {
          throw new Error(`parseLogSampling: invalid token "${token}"`);
        }

        if (parts[1] && originPath.startsWith(parts[1])) {
          if (!fallback.origin || parts[1].length >= fallback.origin.specificity) {
            // apply origin fallback if it's more specific than already
            // collected configuration
            fallback.origin = {
              specificity: parts[1].length,
              factor,
            };
          }
        }
        break;
      }

      case "trace": {
        if (parts.length !== 3) {
          throw new Error(`parseLogSampling: invalid token "${token}"`);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        byTrace[parts[1]!] = factor;
        break;
      }

      case "level": {
        if (parts.length !== 3) {
          throw new Error(`parseLogSampling: invalid token "${token}"`);
        }

        byLevel[logLevelSchema(parts[1])] = factor;
        break;
      }

      default:
        throw new Error(`parseLogSampling: invalid token "${token}"`);
    }
  }

  const defaultFactor = fallback.origin?.factor ?? fallback.wildcard;

  //
  // STEP: iterate over each available level and extract per-level sampling
  // factors
  //

  const parseByLevel = (level: Exclude<LogLevel, "silent">) => {
    const baseFactor = byLevel[level] != null ? Math.max(defaultFactor, byLevel[level]) : defaultFactor;

    return {
      default: baseFactor,
      byTrace: Object.fromEntries(
        Object.entries(byTrace).filter(([, traceFactor]) => {
          return traceFactor > baseFactor;
        }),
      ),
    };
  };

  return {
    verbose: parseByLevel("verbose"),
    debug: parseByLevel("debug"),
    info: parseByLevel("info"),
    warn: parseByLevel("warn"),
    error: parseByLevel("error"),
    fatal: parseByLevel("fatal"),
  };
}

/**
 * tiny helper to extract factor value from string.
 */
function parseFactor(input: string) {
  const factor = parseFloat(input);

  if (Number.isNaN(factor) || factor < 0 || factor > 1) {
    throw new Error(`parseFactor: invalid factor "${input}"`);
  }

  return factor;
}

const logLevelSchema = checkpoint(
  "logLevel",
  check.literal<Exclude<LogLevel, "silent">>("verbose", "debug", "info", "warn", "error", "fatal"),
);
