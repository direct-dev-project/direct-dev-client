import path from "path";

import withRecommendedConfig from "@direct.dev/tooling-rollup-config/recommended";

export default withRecommendedConfig(import.meta.dirname, {
  input: {
    index: path.resolve(import.meta.dirname, "src", "index.ts"),
    "index.ethers": path.resolve(import.meta.dirname, "src", "index.ethers.ts"),
    "index.wagmi": path.resolve(import.meta.dirname, "src", "index.wagmi.ts"),
    "index.web3": path.resolve(import.meta.dirname, "src", "index.web3.ts"),
  },
});
