import type { SupportedNetworkId, SupportedChainId, SupportedChainType } from "@direct.dev/shared";

export type SupportedNetworkConfig = {
  /**
   * human-readable ID of the chain, which can be used to group networks
   * together when presenting available networks to users.
   */
  chainId: SupportedChainId;

  /**
   * The type of the chain, which is used to handle compatibility across
   * multiple chains within the rpc-cache and rpc-distributor applications.
   */
  chainType: SupportedChainType;

  /**
   * The type of API to interact with the chain (currently only JSONRPC is
   * handled by Direct.dev).
   */
  apiType: "jsonrpc";

  /**
   * Blockchain ID, which can be used to verify correctness of provider nodes
   * associated with this chain (ie. they must reply with the same chainId to
   * be correctly mapped).
   */
  blockChainId: string;

  /**
   * human-readable label for the network, which can be used when representing
   * this network within UIs (note that this must be used in combination with
   * the chain's label for fully qualified network identification).
   *
   * @see SupportedChainConfig
   */
  networkLabel: string;
};

/**
 * Configuration of all networks supported within the rpc-cache and
 * rpc-distributor applications
 *
 * @note the order of entries will affect the order of networks, as presented
 *       within the Dashboard UI.
 */
export const supportedNetworks: Record<SupportedNetworkId, SupportedNetworkConfig> = {
  "base-sepolia": {
    chainId: "base",
    networkLabel: "Sepolia",
    blockChainId: "0x14a34",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  base: {
    chainId: "base",
    networkLabel: "Mainnet",
    blockChainId: "0x2105",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  arbitrum: {
    chainId: "arbitrum",
    networkLabel: "Mainnet",
    blockChainId: "0xa4b1",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "arbitrum-sepolia": {
    chainId: "arbitrum",
    networkLabel: "Sepolia",
    blockChainId: "0x66eee",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  optimism: {
    chainId: "optimism",
    networkLabel: "Mainnet",
    blockChainId: "0xa",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "optimism-sepolia": {
    chainId: "optimism",
    networkLabel: "Sepolia",
    blockChainId: "0xaa37dc",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "sonic-testnet": {
    chainId: "sonic",
    networkLabel: "Blaze Testnet",
    blockChainId: "0xdede",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  sonic: {
    chainId: "sonic",
    networkLabel: "Mainnet",
    blockChainId: "0x92",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  bsc: {
    chainId: "bsc",
    networkLabel: "Mainnet",
    blockChainId: "0x38",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "bsc-testnet": {
    chainId: "bsc",
    networkLabel: "Testnet",
    blockChainId: "0x61",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  avalanche: {
    chainId: "avalanche",
    networkLabel: "Mainnet",
    blockChainId: "0xa86a",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "avalanche-fuji": {
    chainId: "avalanche",
    networkLabel: "Fuji",
    blockChainId: "0xa869",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  ethereum: {
    chainId: "ethereum",
    networkLabel: "Mainnet",
    blockChainId: "0x1",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "ethereum-sepolia": {
    chainId: "ethereum",
    networkLabel: "Sepolia",
    blockChainId: "0xaa36a7",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "ethereum-holesky": {
    chainId: "ethereum",
    networkLabel: "Holesky",
    blockChainId: "0x4268",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  polygon: {
    chainId: "polygon",
    networkLabel: "Mainnet",
    blockChainId: "0x89",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
  "polygon-amoy": {
    chainId: "polygon",
    networkLabel: "Amoy",
    blockChainId: "0x13882",
    chainType: "EVM",
    apiType: "jsonrpc",
  },
};
