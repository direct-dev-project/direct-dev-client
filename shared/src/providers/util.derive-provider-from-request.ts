/**
 * utility that helps derive a designated provider from a request input, in
 * cases where the request isn't using the universal jsonrpc API, and thus must
 * be run through a specific provider.
 */
export function deriveProviderFromRequest(request: DirectRPCRequest): SupportedProviderId | "direct.dev" | undefined {
  if (request.method.slice(0, 7) === "direct_") {
    return "direct.dev";
  }

  if (request.method.slice(0, 3) === "qn_") {
    return "quicknode";
  }

  if (request.method.slice(0, 5) === "ankr_") {
    return "ankr";
  }

  if (request.method.slice(0, 8) === "alchemy_") {
    return "alchemy";
  }

  return undefined;
}
