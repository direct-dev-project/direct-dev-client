# @direct.dev/wire

[![License](https://img.shields.io/badge/license-Direct.dev%20Terms%20and%20Conditions-blue)](./LICENSE.md)

Hyper-optimized encoding and decoding utilities for the Direct.dev ecosystem, written for minimal payload sizes and maximum performance for high-throughput Web3 JSON-RPC calls in our multi-tiered infrastructure.

## ‼️ Internal Use Only

This package is for internal use and not designed for external consumption. API stability is not guaranteed.

## Features

- **Minimal overhead encoding/decoding** keeping our systems responsive during high-throughput.
- **Bandwidth-efficient transmission** by encoding only content, not structural information.
- **Tailored for Web3 JSON-RPC** to specifically optimize the most common calls for Direct.dev.

## Design Rationale

`@direct.dev/wire` was built for maximum speed and minimal payload size in the Direct.dev ecosystem. Schemas are embedded directly in code, keeping the encoding/decoding path predictable and tightly optimized.

We chose UTF-8 as transfer format over full-binary formats: while binary can shrink payloads slightly, it proved to add unwanted overhead when decoding large strings. UTF-8 strikes the balance of small footprint, straightforward parsing, and fast decoding.

The library prioritizes raw encode/decode performance and bandwidth footprint above all else — sometimes at the expense of code readability — to handle high-throughput JSON-RPC workloads reliably.

**Non-goals:** it is not intended as a general-purpose serialization format or a developer-friendly abstraction layer.

## License

🛡️ **License:** This software is provided under the [Direct.dev Terms and Conditions](./LICENSE.md).
Use of this software requires agreement to those terms.

For inquiries, contact [info@direct.dev](mailto:info@direct.dev).
