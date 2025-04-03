# @direct.dev/wagmi

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
    <a href="https://www.npmjs.com/package/@direct.dev/wagmi"><img alt="NPM Version" src="https://img.shields.io/npm/v/%40direct.dev%2Fwagmi?style=for-the-badge&labelColor=555&color=00BCB1"></a>
    <a href="https://bundlephobia.com/package/@direct.dev/wagmi"><img alt="NPM Bundle size" src="https://img.shields.io/bundlephobia/minzip/%40direct.dev%2Fwagmi?style=for-the-badge&labelColor=555&color=00BCB1"></a>
    <a href="https://github.com/direct-dev-project/direct-dev-client/blob/main/LICENSE"><img alt="NPM License" src="https://img.shields.io/npm/l/%40direct.dev%2Fwagmi?style=for-the-badge&labelColor=555&color=00BCB1"></a>
  </p>
</div>

A **Wagmi**-compatible provider that integrates with the [Direct.dev](https://direct.dev/) RPC infrastructure, providing **read-layer caching** for improved performance and reduced costs.

## Features

- 🚀 **Optimized RPC calls** via Direct.dev
- 🔌 **Drop-in replacement** for your existing Wagmi configurations
- 🛡 **Dependency-free**, ensuring security and stability
- 📉 **Lower latency and costs** with efficient request routing

## Installation

```sh
npm install @direct.dev/wagmi wagmi@2.x viem@2.x
# or
yarn add @direct.dev/wagmi wagmi@2.x viem@2.x
# or
pnpm add @direct.dev/wagmi wagmi@2.x viem@2.x
```

## Usage

```tsx
// Import dependencies
import { createConfig } from "wagmi";
import { direct } from "@direct.dev/wagmi";

// Configure the Direct.dev Client
const directConfig = {
  projectId: "123",
  projectToken: "abc",
};

// Configure the Wagmi Client
const config = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: direct({
      ...directConfig,
      networkId: "ethereum",
      providers: ["https://your-provider-endpoint.com/"],
    }),
    [sepolia.id]: direct({
      ...directConfig,
      networkId: "ethereum-sepolia",
      providers: ["https://your-provider-endpoint.com/"],
    }),
  },
});


// Example: Provide the Wagmi config to your application
export default function App() {
  return (
    <WagmiConfig config={config}>
      <Home />
    </WagmiConfig>
  );
}
```

## Documentation

For full API reference and detailed usage guides, visit our [official documentation](https://direct.dev/docs/).

## Contributing

We welcome contributions! If you find a bug or have an improvement, feel free to open an issue or submit a pull request.

## Support

Join our [Discord community](https://discord.gg/directdotdev) for discussions and support.

## License

This project is licensed under the [MIT License](https://github.com/direct-dev-project/direct-dev-client/blob/main/LICENSE).
