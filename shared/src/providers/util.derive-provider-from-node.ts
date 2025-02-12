import type { SupportedProviderId } from "../typings.providers.js";

/**
 * utility that derives the provider id based on a node URL (basically
 * recognizing and mapping hosts to specific RPC providers)
 *
 * @todo (Kasper, 04-02-2025): implement mapping of URL --> provider
 */
export function deriveProviderFromNodeUrl(nodeUrl: string): SupportedProviderId | undefined {
  switch (nodeUrl) {
    default:
      return undefined;
  }
}
