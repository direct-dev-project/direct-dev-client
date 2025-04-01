import type { SupportedNetworkId, SupportedProviderId } from "@direct.dev/shared";

export type SupportedProviderConfig = {
  title: string;
  logoUrl: string;

  /**
   * collection of nodeUrl templates for each network supported by the given
   * provider.
   */
  networks: Partial<Record<SupportedNetworkId, string[]>>;
};

/**
 * Configurations of all Web3 Data Providers supported by Direct.dev
 *
 * @note the order of entries will affect the order of providers, as presented
 *       within the Dashboard UI.
 */
export const supportedProviders: Record<SupportedProviderId, SupportedProviderConfig> = {
  alchemy: {
    title: "Alchemy",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: ["https://arb-mainnet.g.alchemy.com/v2/{apiKey}"],
      "arbitrum-sepolia": ["https://arb-sepolia.g.alchemy.com/v2/{apiKey}"],
      avalanche: ["https://avax-mainnet.g.alchemy.com/v2/{apiKey}"],
      "avalanche-fuji": ["https://avax-fuji.g.alchemy.com/v2/{apiKey}"],
      base: ["https://base-mainnet.g.alchemy.com/v2/{apiKey}"],
      "base-sepolia": ["https://base-sepolia.g.alchemy.com/v2/{apiKey}"],
      bsc: ["https://bnb-mainnet.g.alchemy.com/v2/{apiKey}"],
      "bsc-testnet": ["https://bnb-testnet.g.alchemy.com/v2/{apiKey}"],
      ethereum: ["https://eth-mainnet.g.alchemy.com/v2/{apiKey}"],
      "ethereum-holesky": ["https://eth-holesky.g.alchemy.com/v2/{apiKey}"],
      "ethereum-sepolia": ["https://eth-sepolia.g.alchemy.com/v2/{apiKey}"],
      optimism: ["https://opt-mainnet.g.alchemy.com/v2/{apiKey}"],
      "optimism-sepolia": ["https://opt-sepolia.g.alchemy.com/v2/{apiKey}"],
      polygon: ["https://polygon-mainnet.g.alchemy.com/v2/{apiKey}"],
      "polygon-amoy": ["https://polygon-amoy.g.alchemy.com/v2/{apiKey}"],
      sonic: ["https://sonic-mainnet.g.alchemy.com/v2/{apiKey}"],
      "sonic-testnet": ["https://sonic-blaze.g.alchemy.com/v2/{apiKey}"],
    },
  },

  ankr: {
    title: "Ankr",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: ["https://rpc.ankr.com/arbitrum/{apiKey}"],
      "arbitrum-sepolia": ["https://rpc.ankr.com/arbitrum_sepolia/{apiKey}"],
      avalanche: ["https://rpc.ankr.com/avalanche/{apiKey}"],
      "avalanche-fuji": ["https://rpc.ankr.com/avalanche_fuji/{apiKey}"],
      base: ["https://rpc.ankr.com/base/{apiKey}"],
      "base-sepolia": ["https://rpc.ankr.com/base_sepolia/{apiKey}"],
      bsc: ["https://rpc.ankr.com/bsc/{apiKey}"],
      "bsc-testnet": ["https://rpc.ankr.com/bsc_testnet_chapel/{apiKey}"],
      ethereum: ["https://rpc.ankr.com/eth/{apiKey}"],
      "ethereum-holesky": ["https://rpc.ankr.com/eth_holesky/{apiKey}"],
      "ethereum-sepolia": ["https://rpc.ankr.com/eth_sepolia/{apiKey}"],
      optimism: ["https://rpc.ankr.com/optimism/{apiKey}"],
      "optimism-sepolia": ["https://rpc.ankr.com/optimism_sepolia/{apiKey}"],
      polygon: ["https://rpc.ankr.com/polygon/{apiKey}"],
      "polygon-amoy": ["https://rpc.ankr.com/polygon_amoy/{apiKey}"],
      sonic: ["https://rpc.ankr.com/sonic_mainnet/{apiKey}"],
      "sonic-testnet": ["https://rpc.ankr.com/sonic_blaze_testnet/{apiKey}"],
    },
  },

  drpc: {
    title: "dRPC",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: ["https://lb.drpc.org/ogrpc?network=arbitrum&dkey={apiKey}"],
      "arbitrum-sepolia": ["https://lb.drpc.org/ogrpc?network=arbitrum-sepolia&dkey={apiKey}"],
      avalanche: ["https://lb.drpc.org/ogrpc?network=avalanche&dkey={apiKey}"],
      "avalanche-fuji": ["https://lb.drpc.org/ogrpc?network=avalanche-fuji&dkey={apiKey}"],
      base: ["https://lb.drpc.org/ogrpc?network=base&dkey={apiKey}"],
      "base-sepolia": ["https://lb.drpc.org/ogrpc?network=base-sepolia&dkey={apiKey}"],
      bsc: ["https://lb.drpc.org/ogrpc?network=bsc&dkey={apiKey}"],
      "bsc-testnet": ["https://lb.drpc.org/ogrpc?network=bsc-testnet&dkey={apiKey}"],
      ethereum: ["https://lb.drpc.org/ogrpc?network=ethereum&dkey={apiKey}"],
      "ethereum-holesky": ["https://lb.drpc.org/ogrpc?network=holesky&dkey={apiKey}"],
      "ethereum-sepolia": ["https://lb.drpc.org/ogrpc?network=sepolia&dkey={apiKey}"],
      optimism: ["https://lb.drpc.org/ogrpc?network=optimism&dkey={apiKey}"],
      "optimism-sepolia": ["https://lb.drpc.org/ogrpc?network=optimism-sepolia&dkey={apiKey}"],
      polygon: ["https://lb.drpc.org/ogrpc?network=polygon&dkey={apiKey}"],
      "polygon-amoy": ["https://lb.drpc.org/ogrpc?network=polygon-amoy&dkey={apiKey}"],
      sonic: ["https://lb.drpc.org/ogrpc?network=sonic&dkey={apiKey}"],
      "sonic-testnet": ["https://lb.drpc.org/ogrpc?network=sonic-testnet&dkey={apiKey}"],
    },
  },

  infura: {
    title: "Infura",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: ["https://arbitrum-mainnet.infura.io/v3/{apiKey}"],
      "arbitrum-sepolia": ["https://arbitrum-sepolia.infura.io/v3/{apiKey}"],
      avalanche: ["https://avalanche-mainnet.infura.io/v3/{apiKey}"],
      "avalanche-fuji": ["https://avalanche-fuji.infura.io/v3/{apiKey}"],
      base: ["https://base-mainnet.infura.io/v3/{apiKey}"],
      "base-sepolia": ["https://base-sepolia.infura.io/v3/{apiKey}"],
      bsc: ["https://bsc-mainnet.infura.io/v3/{apiKey}"],
      "bsc-testnet": ["https://bsc-testnet.infura.io/v3/{apiKey}"],
      ethereum: ["https://mainnet.infura.io/v3/{apiKey}"],
      "ethereum-holesky": ["https://holesky.infura.io/v3/{apiKey}"],
      "ethereum-sepolia": ["https://sepolia.infura.io/v3/{apiKey}"],
      optimism: ["https://optimism-mainnet.infura.io/v3/{apiKey}"],
      "optimism-sepolia": ["https://optimism-sepolia.infura.io/v3/{apiKey}"],
      polygon: ["https://polygon-mainnet.infura.io/v3/{apiKey}"],
      "polygon-amoy": ["https://polygon-amoy.infura.io/v3/{apiKey}"],
    },
  },

  quicknode: {
    title: "Quicknode",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: ["https://{endpoint}.arbitrum-mainnet.quiknode.pro/{apiKey}"],
      "arbitrum-sepolia": ["https://{endpoint}.arbitrum-sepolia.quiknode.pro/{apiKey}"],
      avalanche: ["https://{endpoint}.avalanche-mainnet.quiknode.pro/{apiKey}/ext/bc/C/rpc/"],
      "avalanche-fuji": ["https://{endpoint}.avalanche-testnet.quiknode.pro/{apiKey}/ext/bc/C/rpc/"],
      base: ["https://{endpoint}.base-mainnet.quiknode.pro/{apiKey}"],
      "base-sepolia": ["https://{endpoint}.base-sepolia.quiknode.pro/{apiKey}"],
      bsc: ["https://{endpoint}.bsc.quiknode.pro/{apiKey}"],
      "bsc-testnet": ["https://{endpoint}.bsc-testnet.quiknode.pro/{apiKey}"],
      ethereum: ["https://{endpoint}.quiknode.pro/{apiKey}"],
      "ethereum-holesky": ["https://{endpoint}.ethereum-holesky.quiknode.pro/{apiKey}"],
      "ethereum-sepolia": ["https://{endpoint}.ethereum-sepolia.quiknode.pro/{apiKey}"],
      optimism: ["https://{endpoint}.optimism.quiknode.pro/{apiKey}"],
      "optimism-sepolia": ["https://{endpoint}.optimism-sepolia.quiknode.pro/{apiKey}"],
      polygon: ["https://{endpoint}.matic.quiknode.pro/{apiKey}"],
      "polygon-amoy": ["https://{endpoint}.matic-amoy.quiknode.pro/{apiKey}"],
    },
  },
};
