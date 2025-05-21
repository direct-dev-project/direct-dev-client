import { supportedProviders } from "./constants.supported-providers.js";
import { compileNodeUrlTemplateToRegEx } from "./util.compile-node-url-template-to-regex.js";

/**
 * utility that derives the provider id based on a node URL (basically
 * recognizing and mapping hosts to specific RPC providers)
 */
export function deriveProviderFromNodeUrl(
  networkId: SupportedNetworkId,
  nodeUrl: string,
): SupportedProviderId | undefined {
  const matchingProviderEntry = Object.entries(supportedProviders).find(([, providerConfig]) => {
    const providerUrls = providerConfig.networks[networkId]?.map(({ nodeUrlTemplate }) =>
      compileNodeUrlTemplateToRegEx(nodeUrlTemplate),
    );

    return providerUrls?.some((providerUrl) => providerUrl.test(nodeUrl));
  });

  return matchingProviderEntry?.[0] as SupportedProviderId | undefined;
}
