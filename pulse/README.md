# @direct.dev/pulse

[![License](https://img.shields.io/badge/license-Direct.dev%20Terms%20and%20Conditions-blue)](./LICENSE.md)

Structured telemetry abstractions for the Direct.dev ecosystem, built to unify logs, metrics, and traces across our multi-tiered Web3 infrastructure.

`@direct.dev/pulse` provides the core primitives for consistent, high-throughput observability.

## ‼️ Internal Use Only

This package is for internal use and not designed for external consumption. API stability is not guaranteed.

## Features

- **Unified model** - logs, metrics, and traces handled consistently with a single abstraction.
- **Structured origins** - every emission is tied to a `PulseOrigin` for clear attribution.
- **Correlated context** - telemetry carries a `PulseContext`, making events easy to connect across layers.
- **Pluggable exporters** - decouples instrumentation from storage, supporting local debugging, internal pipelines, or external observability backends.
- **Lightweight tracing** - span semantics align with OpenTelemetry while staying efficient in Edge and Browser runtimes.

## Example

```ts
const pulse = new Pulse(origin, {
  logLevel: '*:info',
  logSamples: '*:1',
  logWriter: consoleWriter,
  metricExporter: myMetricExporter,
  traceExporter: myTraceExporter,
});

const req = await pulse.trace({ traceName: "rpc-call", traceId: undefined, parentSpanId: undefined }, { event: "parse-request", requestId: "abc123", }, async (t) => {
  t.info('parsing request');
  t.count('requests_total', 1, { method: 'getBlock' });

  // application logic
  return parseRequest(t, rawInput);
});
```

## Design Rationale

Telemetry is only valuable if it is structured and correlated from the start. Ad-hoc logging leads to noise, unqueryable data, and signals that cannot be joined later.

We created `@direct.dev/pulse` as a way to enforce a single, consistent shape across logs, metrics, and traces. By embedding origin and context into every emission, we guarantee that signals can be filtered, aggregated, and analyzed at any level of the stack.

We avoided building another heavyweight tracing framework. Instead, Pulse aligns with OpenTelemetry semantics while stripping down to the essentials required for high-throughput, edge- and browser-ready environments. The result is a lean, predictable telemetry layer that makes failures and performance bottlenecks visible without adding unnecessary cost or complexity.

## License

🛡️ **License:** This software is provided under the [Direct.dev Terms and Conditions](./LICENSE.md).
Use of this software requires agreement to those terms.

For inquiries, contact [info@direct.dev](mailto:info@direct.dev).
