// eslint-disable-next-line import-x/no-extraneous-dependencies
import { defineChain } from "viem";

/**
 * some versions of viem doesn't include sonicBlazeTestnet, which is the
 * correct testnet per 2025-07-25; hardcoded replica included here.
 */
export const sonicBlazeTestnet = defineChain({
  id: 57_054,
  name: "Sonic Blaze Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Sonic",
    symbol: "S",
  },
  rpcUrls: {
    default: { http: ["https://rpc.blaze.soniclabs.com"] },
  },
  blockExplorers: {
    default: {
      name: "Sonic Blaze Testnet Explorer",
      url: "https://testnet.sonicscan.org",
    },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 1100,
    },
  },
  testnet: true,
});
