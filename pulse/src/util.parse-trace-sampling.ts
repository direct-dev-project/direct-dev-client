/**
 * Parsed configuration of trace sampling, values ranging from 0 (nothing is
 * sampled) to 1 (everything is sampled).
 */
export type ParsedTraceSampling = {
  /**
   * Default sampling factor to apply, if not overwritten by specific
   * traces.
   */
  default: number;

  /**
   * Overrides of sampling by specific traces.
   */
  byEvent: Record<string, number>;
};

/**
 * Parses provided trace sampling pattern, and infers factors by origin and
 * trace.
 *
 * Supported tokens:
 *   - wildcard: "*:<factor>"
 *   - by origin: "origin:<selector>:<factor>"
 *   - by event: "event:<selector>:<factor>"
 *
 * @example pattern input
 * ```text
 * *:0.02 origin:rpc.revalidator:1 event:revalidate:1
 * ```
 */
export function parseTraceSampling(input: string, originPath: string): ParsedTraceSampling {
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  //
  // STEP: parse and prepare global configurations, for subsequent per-level
  // parsing
  //
  const byEvent: Record<string, number> = {};
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
          throw new Error(`parseTraceSampling: invalid token "${token}"`);
        }

        fallback.wildcard = factor;
        break;
      }

      case "origin": {
        if (parts.length !== 3) {
          throw new Error(`parseTraceSampling: invalid token "${token}"`);
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

      case "event": {
        if (parts.length !== 3) {
          throw new Error(`parseTraceSampling: invalid token "${token}"`);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        byEvent[parts[1]!] = factor;
        break;
      }

      default:
        throw new Error(`parseTraceSampling: invalid token "${token}"`);
    }
  }

  return {
    default: fallback.origin?.factor ?? fallback.wildcard,
    byEvent,
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
