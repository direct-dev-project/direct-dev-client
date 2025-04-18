/**
 * Definition of supported Web3 Data providers within the Direct.dev
 * infrastructure.
 */
export type SupportedProviderId = "ankr" | "alchemy" | "drpc" | "infura" | "quicknode";

/**
 * Definition of supported Web3 chain types|  used to determine how to correctly
 * handle analysis of incoming requests and responses.
 */
export type SupportedChainType = "EVM" | "SVM";

/**
 * Definition of all supported chains by Direct.dev.
 */
export type SupportedChainId =
  | "base"
  | "arbitrum"
  | "optimism"
  | "sonic"
  | "bsc"
  | "avalanche"
  | "ethereum"
  | "polygon";

/**
 * Definition of networks supported by Direct.dev (internally maps to specific
 * provider nodes)
 */
export type SupportedNetworkId =
  | "base-sepolia"
  | "base"
  | "arbitrum"
  | "arbitrum-sepolia"
  | "optimism"
  | "optimism-sepolia"
  | "sonic-testnet"
  | "sonic"
  | "bsc"
  | "bsc-testnet"
  | "avalanche"
  | "avalanche-fuji"
  | "ethereum"
  | "ethereum-sepolia"
  | "ethereum-holesky"
  | "polygon"
  | "polygon-amoy";
