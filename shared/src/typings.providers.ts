/**
 * Definition of supported Web3 Data providers within the Direct.dev
 * infrastructure.
 */
export type SupportedProviderId = "ankr" | "alchemy" | "quicknode";

/**
 * Definition of supported Web3 chain types, used to determine how to correctly
 * handle analysis of incoming requests and responses.
 */
export type SupportedChainType = "EVM" | "SVM";

/**
 * Definition of all supported chains by Direct.dev.
 */
export type SupportedChainId = "ethereum" | "solana";

/**
 * Definition of networks supported by Direct.dev (internally maps to specific
 * provider nodes)
 */
export type SupportedNetworkId = "ethereum-mainnet" | "ethereum-testnet" | "solana-mainnet";
