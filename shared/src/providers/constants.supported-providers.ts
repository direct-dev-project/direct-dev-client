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
        acceptedRoutingTags: Set<SupportedRoutingTag>;
      }>
    >
  >;
};

const allRoutingTags = new Set(["default", "slow", "archive", "envio"] as const);

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
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://arb-sepolia.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://avax-mainnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://avax-fuji.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://base-mainnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://base-sepolia.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://bnb-mainnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://bnb-testnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://eth-mainnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://eth-holesky.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://eth-sepolia.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://opt-mainnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://opt-sepolia.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://polygon-mainnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://polygon-amoy.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      sonic: [
        {
          nodeUrlTemplate: "https://sonic-mainnet.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "sonic-testnet": [
        {
          nodeUrlTemplate: "https://sonic-blaze.g.alchemy.com/v2/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
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
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/arbitrum_sepolia/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/avalanche/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/avalanche_fuji/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/base/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/base_sepolia/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/bsc/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/bsc_testnet_chapel/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/eth/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/eth_holesky/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/eth_sepolia/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/optimism/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/optimism_sepolia/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/polygon/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/polygon_amoy/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      sonic: [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/sonic_mainnet/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "sonic-testnet": [
        {
          nodeUrlTemplate: "https://rpc.ankr.com/sonic_blaze_testnet/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
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
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=arbitrum-sepolia&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=avalanche&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=avalanche-fuji&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=base&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=base-sepolia&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=bsc&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=bsc-testnet&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=ethereum&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=holesky&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=sepolia&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=optimism&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=optimism-sepolia&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=polygon&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=polygon-amoy&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      sonic: [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=sonic&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "sonic-testnet": [
        {
          nodeUrlTemplate: "https://lb.drpc.org/ogrpc?network=sonic-testnet&dkey={apiKey}",
          acceptedRoutingTags: allRoutingTags,
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
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://arbitrum-sepolia.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://avalanche-mainnet.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://avalanche-fuji.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://base-mainnet.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://base-sepolia.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://bsc-mainnet.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://bsc-testnet.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://mainnet.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://holesky.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://sepolia.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://optimism-mainnet.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://optimism-sepolia.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://polygon-mainnet.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://polygon-amoy.infura.io/v3/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
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
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "arbitrum-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.arbitrum-sepolia.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      avalanche: [
        {
          nodeUrlTemplate: "https://{endpoint}.avalanche-mainnet.quiknode.pro/{apiKey}/ext/bc/C/rpc/",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "avalanche-fuji": [
        {
          nodeUrlTemplate: "https://{endpoint}.avalanche-testnet.quiknode.pro/{apiKey}/ext/bc/C/rpc/",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      base: [
        {
          nodeUrlTemplate: "https://{endpoint}.base-mainnet.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "base-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.base-sepolia.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      bsc: [
        {
          nodeUrlTemplate: "https://{endpoint}.bsc.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "bsc-testnet": [
        {
          nodeUrlTemplate: "https://{endpoint}.bsc-testnet.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      ethereum: [
        {
          nodeUrlTemplate: "https://{endpoint}.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-holesky": [
        {
          nodeUrlTemplate: "https://{endpoint}.ethereum-holesky.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "ethereum-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.ethereum-sepolia.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      optimism: [
        {
          nodeUrlTemplate: "https://{endpoint}.optimism.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "optimism-sepolia": [
        {
          nodeUrlTemplate: "https://{endpoint}.optimism-sepolia.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      polygon: [
        {
          nodeUrlTemplate: "https://{endpoint}.matic.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
      "polygon-amoy": [
        {
          nodeUrlTemplate: "https://{endpoint}.matic-amoy.quiknode.pro/{apiKey}",
          acceptedRoutingTags: allRoutingTags,
        },
      ],
    },
  },
};
