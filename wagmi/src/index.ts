import type { Client, Chain } from "viem";
import type { Config, CreateConfigParameters, CreateConnectorFn, Transport } from "wagmi";
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { createConfig } from "wagmi";

import { type DirectRPCClientConfig } from "@direct.dev/client";
import { buildDirectConfig, buildViemConfig, createDirectViemTransport, extendDirectClient } from "@direct.dev/viem";

type DirectConfig = Omit<DirectRPCClientConfig, "networkId" | "failover">;
type DirectTransport = (failoverProviders?: DirectRPCClientConfig["failover"]) => Transport;

/**
 * Create a Wagmi Configuration, which is given a custom `direct` transport to
 * run requests through DirectRPCClient for selected networks, and which
 * automatically extends created clients to add support for real time receipts
 */
export default function createDirectConfig<
  const TChains extends readonly [Chain, ...Chain[]],
  TTransports extends Record<TChains[number]["id"], Transport>,
  const TConnectors extends readonly CreateConnectorFn[],
>(
  wagmiConfig: (direct: DirectTransport) => CreateConfigParameters<TChains, TTransports, TConnectors>,
  directConfig: DirectConfig,
): Config<TChains, TTransports, TConnectors> {
  const direct = createDirectTransport(directConfig);
  const config = createConfig(wagmiConfig(direct));

  // override config to intercept calls to getClient, and ensure that we
  // automatically extend the underlying Viem client with real-time receipt
  // functionality
  const getClient = config.getClient;
  const extendedClients = new WeakSet<Client>();

  config.getClient = function (params) {
    const client = getClient(params);

    if (!extendedClients.has(client) && client.transport.type === "direct" && "directConfig" in client.transport) {
      const [viemConfig, directConfig] = buildViemConfig(client.transport["directConfig"], client.chain);

      extendDirectClient(client, viemConfig, directConfig);
    }

    return client;
  };

  return config;
}

/**
 * Internal utility to create a transport for DirectRPCClient, which will be
 * provided to the Wagmi config factory function.
 */
function createDirectTransport(
  config: DirectConfig,
): (failoverProviders?: DirectRPCClientConfig["failover"]) => Transport {
  return (failoverProviders) =>
    ({ chain }) => {
      if (!chain) {
        // if the transport is ever accessed outside of Wagmi, ensure that chain
        // object is provided
        throw new Error("createDirectTransport(): chain must be provided");
      }

      return createDirectViemTransport(buildDirectConfig({ ...config, failover: failoverProviders }, chain));
    };
}
