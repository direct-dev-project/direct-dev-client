# @direct.dev/checkpoint

[![License](https://img.shields.io/badge/license-Direct.dev%20Terms%20and%20Conditions-blue)](./LICENSE.md)

High-performance runtime shape validation utilities for the Direct.dev ecosystem, designed for minimal overhead and clear, context-rich error reporting.

These helpers provide fast, dependency-free validation and parsing for untrusted data.

## ‼️ Internal Use Only

This package is for internal use and not designed for external consumption. API stability is not guaranteed.

## Features

- **Context-aware validation** — all validators automatically track nested object/array paths for precise error messages.
- **Zero dependencies** — optimized for hot-path performance in high-throughput systems.
- **Declarative parsing style** — shape and validation logic live together for maximum readability.

## Example

```ts
import { parse, shape, strOrNum, str, unknown } from "@direct.dev/checkpoint";

const req = parse(input, "rpcRequest", shape({
  id: strOrNum(req.id, `${ctx}.id`),
  method: str(req.method, `${ctx}.method`),
  params: unknown(req.params),
}));
```

If `input.method` is `null`, the error will read:

```text
rpcRequest.method must be a string or a number
```

## Design Rationale

We built `@direct.dev/checkpoint` around the principle of doing only what the Direct.dev ecosystem actually needs. Most validation libraries aim to cover every possible case, but that breadth comes with complexity and runtime cost. By deliberately narrowing scope, we get a lean tool that makes schemas easy to declare, read, and keep in sync with surrounding logic.

When data is malformed, errors are not just thrown but reported with context, so the source of the problem is immediately clear.

## License

🛡️ **License:** This software is provided under the [Direct.dev Terms and Conditions](./LICENSE.md).
Use of this software requires agreement to those terms.

For inquiries, contact [info@direct.dev](mailto:info@direct.dev).
