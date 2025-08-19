import type { Networkish } from "ethers";

/**
 * harcoded mapping of Direct.dev network ID --> Ethers Networkish
 */
export const networks: Record<SupportedNetworkId, Networkish> = {
  ethereum: "mainnet",
  "ethereum-holesky": "holesky",
  "ethereum-sepolia": "sepolia",
  sonic: {
    name: "sonic",
    chainId: 146,
  },
  "sonic-testnet": {
    name: "sonic-testnet",
    chainId: 64_165,
  },
};
