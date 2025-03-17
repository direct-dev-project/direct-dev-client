# @direct.dev/ethers

[![npm version](https://img.shields.io/npm/v/@direct.dev/web3.svg)](https://www.npmjs.com/package/@direct.dev/web3)
[![License](https://img.shields.io/github/license/direct-dev-project/direct-dev-client.svg)](LICENSE)

An `ethers`-compatible provider that integrates with the [Direct.dev](https://direct.dev/) RPC infrastructure, providing **read-layer caching** for improved performance and reduced costs.

## Features

- 🚀 **Optimized RPC calls** via Direct.dev
- 🔌 **Drop-in replacement** for Web3 providers
- 🛡 **Dependency-free**, ensuring security and stability
- 📉 **Lower latency and costs** with efficient request routing

## Installation

```sh
npm install @direct.dev/viem
# or
yarn add @direct.dev/viem
# or
pnpm add @direct.dev/viem
```

## Usage

```ts
import { DirectEthersProvider } from "@direct.dev/ethers";

// Copy + paste configurations from your Direct.dev project dashboard for
// correctness
const provider = new DirectEthersProvider({
  projectId: "your-project-id",
  networkId: "your-network-id",
  providers: ["https://your-provider-endpoints.com/"],
});

const response = await provider.getBlockNumber();

console.log(response);
```

## Documentation

For full API reference and detailed usage guides, visit our [official documentation](https://direct.dev/docs/).

## Contributing

We welcome contributions! If you find a bug or have an improvement, feel free to open an issue or submit a pull request.

## Support

Join our [Discord community](https://discord.gg/directdotdev) for discussions and support.

## License

This project is licensed under the [MIT License](https://github.com/direct-dev-project/direct-dev-client/blob/main/LICENSE).
