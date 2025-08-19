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
type SupportedChainId = "ethereum" | "sonic";

/**
 * Definition of networks supported by Direct.dev (internally maps to specific
 * provider nodes)
 */
type SupportedNetworkId = "ethereum-holesky" | "ethereum-sepolia" | "ethereum" | "sonic-testnet" | "sonic";

/**
 * Definition of upstream request routing tags; used for effecient and correct
 * distribution of requests
 */
type SupportedRoutingTag = "default" | "slow" | "archive" | "envio";

/**
 * Enforced delivery of all routing tags
 */
type AllRoutingTags = TupleFromUnion<SupportedRoutingTag>;

// Convert the union to a tuple (order is not enforced)
type TupleFromUnion<T, U = T> = [T] extends [never] ? [] : { [K in T]: [K, ...TupleFromUnion<Exclude<U, K>>] }[T];
