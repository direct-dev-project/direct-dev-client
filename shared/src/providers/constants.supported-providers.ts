import type { SupportedNetworkId, SupportedProviderId } from "@direct.dev/shared";

export type SupportedRequestType = "default" | "slow" | "archive";

export type SupportedProviderConfig = {
  title: string;
  logoUrl: string;

  /**
   * collection of nodeUrl templates for each network supported by the given
   * provider.
   */
  networks: Partial<
    Record<
      SupportedNetworkId,
      Array<{
        nodeUrlTemplate: string;
        supportedRequestTypes: Set<SupportedRequestType>;
      }>
    >
  >;
};

const allCategories = new Set(["default", "slow", "archive"] as const);

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
      arbitrum: [
        {
          nodeUrlTemplate: "https://arb-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://arb-sepolia.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://avax-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://avax-fuji.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://base-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://base-sepolia.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://bnb-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://bnb-testnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://eth-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://eth-holesky.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://eth-sepolia.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://opt-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://opt-sepolia.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://polygon-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://polygon-amoy.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      sonic: [
        {
          nodeUrlTemplate: "https://sonic-mainnet.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "sonic-testnet": [
        {
          nodeUrlTemplate: "https://sonic-blaze.g.alchemy.com/v2/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
    },
  },

  ankr: {
    title: "Ankr",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/arbitrum/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/arbitrum_sepolia/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/avalanche/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/avalanche_fuji/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/base/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/base_sepolia/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/bsc/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/bsc_testnet_chapel/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/eth/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/eth_holesky/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/eth_sepolia/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/optimism/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/optimism_sepolia/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/polygon/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/polygon_amoy/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      sonic: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/sonic_mainnet/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "sonic-testnet": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/sonic_blaze_testnet/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
    },
  },

  drpc: {
    title: "dRPC",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=arbitrum&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=arbitrum-sepolia&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=avalanche&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=avalanche-fuji&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=base&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=base-sepolia&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=bsc&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=bsc-testnet&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=ethereum&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=holesky&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=sepolia&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=optimism&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=optimism-sepolia&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=polygon&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=polygon-amoy&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      sonic: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=sonic&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "sonic-testnet": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=sonic-testnet&dkey={apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
    },
  },

  infura: {
    title: "Infura",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: [
        {
          nodeUrlTemplate: "https://arbitrum-mainnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://arbitrum-sepolia.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://avalanche-mainnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://avalanche-fuji.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://base-mainnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://base-sepolia.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://bsc-mainnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://bsc-testnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://mainnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://holesky.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://sepolia.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://optimism-mainnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://optimism-sepolia.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://polygon-mainnet.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://polygon-amoy.infura.io/v3/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
    },
  },

  quicknode: {
    title: "Quicknode",
    logoUrl: "https://url.to/logo.png",
    networks: {
      arbitrum: [
        {
          nodeUrlTemplate: "https://{endpoint}.arbitrum-mainnet.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.arbitrum-sepolia.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://{endpoint}.avalanche-mainnet.quiknode.pro/{apiKey}/ext/bc/C/rpc/",
          supportedRequestTypes: allCategories,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://{endpoint}.avalanche-testnet.quiknode.pro/{apiKey}/ext/bc/C/rpc/",
          supportedRequestTypes: allCategories,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://{endpoint}.base-mainnet.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.base-sepolia.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://{endpoint}.bsc.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://{endpoint}.bsc-testnet.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://{endpoint}.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://{endpoint}.ethereum-holesky.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.ethereum-sepolia.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://{endpoint}.optimism.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.optimism-sepolia.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://{endpoint}.matic.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://{endpoint}.matic-amoy.quiknode.pro/{apiKey}",
          supportedRequestTypes: allCategories,
        },
      ],
    },
  },
};
