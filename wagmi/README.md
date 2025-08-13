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
    <a href="./LICENSE.md"><img alt="License" src="https://img.shields.io/badge/license-Direct.dev%20Terms%20and%20Conditions-blue?style=for-the-badge&labelColor=555&color=00BCB1"></a>
  </p>
</div>

A **Wagmi**-compatible transport that integrates with the [Direct.dev](https://direct.dev/) RPC infrastructure, providing **read-layer caching** for improved performance and reduced costs.

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
import { http } from "wagmi";
import { mainnet, sepolia, polygon } from "wagmi/chains";
import createDirectConfig from "@direct.dev/wagmi";

// Configure the Wagmi through the Direct.dev Client
const config = createDirectConfig(
  // Wagmi configurations
  (direct) => ({
    chains: [mainnet, sepolia, polygon],
    transports:{
      [mainnet.id]: direct(),
      [sepolia.id]: direct(),
      [polygon.id]: http(),
    }
  }),

  // Direct.dev configurations
  {
    projectId: "your-project-id", // From the Direct.dev dashboard
    projectToken: "************", // From the Direct.dev dashboard
  },
);

// Example: Provide the Wagmi config to your application
export default function App() {
  return (
    <WagmiConfig config={config}>
      <Home />
    </WagmiConfig>
  );
}
```

**Note:** If you're already using `client` callback in your Wagmi setup (instead of `transports`), we recommend using [@direct.dev/viem](https://npmjs.com/package/@direct.dev/viem) directly to construct the Viem client for supported chains. This gives you full control while retaining Direct.dev's performance benefits.

## Documentation

For full API reference and detailed usage guides, visit our [official documentation](https://direct.dev/docs/).

## Support

Join our [Discord community](https://discord.gg/directdotdev) for discussions and support.

## License

🛡️ **License:** This software is provided under the [Direct.dev Terms and Conditions](./LICENSE.md).  
Use of this software requires agreement to those terms.

For inquiries, contact [info@direct.dev](mailto:info@direct.dev).
