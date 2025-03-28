# @direct.dev/viem

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
    <a href="https://www.npmjs.com/package/@direct.dev/viem"><img alt="NPM Version" src="https://img.shields.io/npm/v/%40direct.dev%2Fviem?style=for-the-badge&labelColor=555&color=12CBC0"></a>
    <a href="https://bundlephobia.com/package/@direct.dev/viem"><img alt="NPM Bundle size" src="https://img.shields.io/bundlephobia/min/%40direct.dev%2Fviem?style=for-the-badge&labelColor=555&color=12CBC0"></a>
    <a href="https://github.com/direct-dev-project/direct-dev-client/blob/main/LICENSE"><img alt="NPM License" src="https://img.shields.io/npm/l/%40direct.dev%2Fviem?style=for-the-badge&labelColor=555&color=12CBC0"></a>
  </p>
</div>

A `viem`-compatible client that integrates with the [Direct.dev](https://direct.dev/) RPC infrastructure, providing **read-layer caching** for improved performance and reduced costs.

## Features

- 🚀 **Optimized RPC calls** via Direct.dev
- 🔌 **Drop-in replacement** for your existing Viem clients
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
// Import dependencies
import { createDirectViemClient } from "@direct.dev/viem";

// Initialize the Direct.dev client
const client = createDirectViemClient({
  projectId: "your-project-id", // From the Direct.dev dashboard
  projectToken: "*****", // From the Direct.dev dashboard
  networkId: "your-network-id", // e.g. "ethereum", "polygon"
  providers: ["https://your-provider-endpoints.com/"],
});

// Example: Fetch the latest block number
const blockNumber = await client.getBlockNumber();
```

## Documentation

For full API reference and detailed usage guides, visit our [official documentation](https://direct.dev/docs/).

## Contributing

We welcome contributions! If you find a bug or have an improvement, feel free to open an issue or submit a pull request.

## Support

Join our [Discord community](https://discord.gg/directdotdev) for discussions and support.

## License

This project is licensed under the [MIT License](https://github.com/direct-dev-project/direct-dev-client/blob/main/LICENSE).
