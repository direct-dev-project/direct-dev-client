import type { SupportedProviderId } from "../typings.providers.js";
import type { DirectRPCRequest } from "../typings.rpc.js";

/**
 * utility that helps derive a designated provider from a request input, in
 * cases where the request isn't using the universal jsonrpc API, and thus must
 * be run through a specific provider.
 *
 * @todo (Kasper, 04-02-2025): implement recognition of specific provider methods
 */
export function deriveProviderFromRequest(request: DirectRPCRequest): SupportedProviderId | "direct.dev" | undefined {
  if (request.method.startsWith("direct_")) {
    return "direct.dev";
  }

  switch (request.method) {
    default:
      return undefined;
  }
}
