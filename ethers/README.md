# @direct.dev/ethers

<div align="center">
  <p>
    <a href="https://direct.dev/">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="media/logo-white-duo.svg">
        <img alt="Direct.dev logo" src="media/logo-black-duo.svg" width="125">
      </picture>
    </a>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@direct.dev/ethers"><img alt="NPM Version" src="https://img.shields.io/npm/v/%40direct.dev%2Fethers?style=for-the-badge&labelColor=555&color=00BCB1"></a>
    <a href="https://bundlephobia.com/package/@direct.dev/ethers"><img alt="NPM Bundle size" src="https://img.shields.io/bundlephobia/minzip/%40direct.dev%2Fethers?style=for-the-badge&labelColor=555&color=00BCB1"></a>
    <a href="https://github.com/direct-dev-project/direct-dev-client/blob/main/LICENSE"><img alt="NPM License" src="https://img.shields.io/npm/l/%40direct.dev%2Fethers?style=for-the-badge&labelColor=555&color=00BCB1"></a>
  </p>
</div>

An **ethers**-compatible provider that integrates with the [Direct.dev](https://direct.dev/) RPC infrastructure, providing **read-layer caching** for improved performance and reduced costs.

## Features

- 🚀 **Optimized RPC calls** via Direct.dev
- 🔌 **Drop-in replacement** for your existing Ethers providers
- 🛡 **Dependency-free**, ensuring security and stability
- 📉 **Lower latency and costs** with efficient request routing

## Installation

```sh
npm install @direct.dev/ethers ethers
# or
yarn add @direct.dev/ethers ethers
# or
pnpm add @direct.dev/ethers ethers
```

## Usage

```ts
// Import dependencies
import { DirectEthersProvider } from "@direct.dev/ethers";

// Initialize the Direct.dev provider
const provider = new DirectEthersProvider({
  projectId: "your-project-id", // From the Direct.dev dashboard
  projectToken: "************", // From the Direct.dev dashboard
  networkId: "your-network-id", // e.g. "ethereum", "polygon"
  providers: ["https://your-provider-endpoints.com/"],
});

// Example: Fetch the latest block number
const blockNumber = await provider.getBlockNumber();
```

## Documentation

For full API reference and detailed usage guides, visit our [official documentation](https://direct.dev/docs/).

## Contributing

We welcome contributions! If you find a bug or have an improvement, feel free to open an issue or submit a pull request.

## Support

Join our [Discord community](https://discord.gg/directdotdev) for discussions and support.

## License

This project is licensed under the [MIT License](https://github.com/direct-dev-project/direct-dev-client/blob/main/LICENSE).
