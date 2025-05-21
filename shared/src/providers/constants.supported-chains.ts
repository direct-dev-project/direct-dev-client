export type SupportedChainConfig = {
  /**
   * Human-readable label for the chain
   */
  chainLabel: string;
};

/**
 * Configuration of all chains supported within the rpc worker.
 *
 * @note the order of entries will affect the order of chains, as presented
 *       within the Dashboard UI.
 */
export const supportedChains: Record<SupportedChainId, SupportedChainConfig> = {
  base: {
    chainLabel: "Base",
  },
  arbitrum: {
    chainLabel: "Arbitrum One",
  },
  optimism: {
    chainLabel: "Optimism",
  },
  sonic: {
    chainLabel: "Sonic",
  },
  bsc: {
    chainLabel: "BNB Smart Chain",
  },
  avalanche: {
    chainLabel: "Avalanche",
  },
  ethereum: {
    chainLabel: "Ethereum",
  },
  polygon: {
    chainLabel: "Polygon",
  },
};
