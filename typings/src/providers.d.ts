/**
 * Definition of supported Web3 Data providers within the Direct.dev
 * infrastructure.
 */
type SupportedProviderId = "ankr" | "alchemy" | "drpc" | "infura" | "quicknode";

/**
 * Definition of supported Web3 chain types|  used to determine how to correctly
 * handle analysis of incoming requests and responses.
 */
type SupportedChainType = "EVM" | "SVM";

/**
 * Definition of all supported chains by Direct.dev.
 */
type SupportedChainId = "base" | "arbitrum" | "optimism" | "sonic" | "bsc" | "avalanche" | "ethereum" | "polygon";

/**
 * Definition of networks supported by Direct.dev (internally maps to specific
 * provider nodes)
 */
type SupportedNetworkId =
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

/**
 * Definition of upstream request routing tags; used for effecient and correct
 * distribution of requests
 */
type SupportedRoutingTag = "default" | "slow" | "archive" | "envio";
