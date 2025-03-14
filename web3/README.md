# @direct.dev/web3

[![npm version](https://img.shields.io/npm/v/@direct.dev/web3.svg)](https://www.npmjs.com/package/@direct.dev/web3)
[![License](https://img.shields.io/github/license/direct-dev-project/direct-dev-client.svg)](LICENSE)

A `web3.js`-compatible provider that integrates with the [Direct.dev](https://direct.dev/) RPC infrastructure, providing **read-layer caching** for improved performance and reduced costs.

## Features

- 🚀 **Optimized RPC calls** via Direct.dev
- 🔌 **Drop-in replacement** for Web3 providers
- 🛡 **Dependency-free**, ensuring security and stability
- 📉 **Lower latency and costs** with efficient request routing

## Installation

```sh
npm install @direct.dev/web3
# or
yarn add @direct.dev/web3
# or
pnpm add @direct.dev/web3
```

## Usage

```ts
import Web3 from "web3";
import { DirectWeb3Provider } from "@direct.dev/web3";

// Copy + paste configurations from your Direct.dev project dashboard for
// correctness
const provider = new DirectWeb3Provider({
  projectId: "your-project-id",
  networkId: "your-network-id",
  providers: ["https://your-provider-endpoints.com/"],
});

const web3 = new Web3(provider);

const response = await web3.eth.getBlockNumber();

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
