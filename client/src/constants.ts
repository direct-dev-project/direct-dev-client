/**
 * hardcoded average gzip compression rate for JSON-RPC responses, used when
 * estimating bandwidth usage.
 */
export const AVG_GZIP_COMPRESSION = 0.925;

/**
 * hardcoded rough average for HTTP header size on HTTP requests
 */
export const AVG_HTTP_REQUEST_HEADER_SIZE = 600;

/**
 * hardcoded rough average for HTTP header size on HTTP responses
 */
export const AVG_HTTP_RESPONSE_HEADER_SIZE = 300;

/**
 * mapping of default failover node URLs
 */
export const DEFAULT_FAILOVER: Record<SupportedNetworkId, string[]> = {
  ethereum: ["https://eth.merkle.io"],
  "ethereum-holesky": ["https://ethereum-holesky-rpc.publicnode.com"],
  "ethereum-sepolia": ["https://sepolia.drpc.org"],

  sonic: ["https://rpc.soniclabs.com"],
  "sonic-testnet": ["https://rpc.testnet.soniclabs.com"],
};
