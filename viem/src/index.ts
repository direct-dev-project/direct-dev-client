/* eslint-disable import-x/no-extraneous-dependencies */
import type { Chain, Client, ClientConfig, PublicClient, PublicClientConfig, Transport } from "viem";
import { createClient, createPublicClient, createTransport, RpcRequestError } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { holesky, mainnet, sepolia, sonic, sonicTestnet } from "viem/chains";
/* eslint-enable import-x/no-extraneous-dependencies */

import type { DirectRPCClientConfig } from "@direct.dev/client";
import { makeDirectRPCClient } from "@direct.dev/client";

import { sonicBlazeTestnet } from "./constants.chains.js";

type Config = Omit<DirectRPCClientConfig, "networkId" | "failover"> & Partial<Pick<DirectRPCClientConfig, "failover">>;

/**
 * Create a Viem PublicClient, which wraps the DirectRPCClient and routes
 * requests through the Direct.dev infrastructure, adding read layer caching
 * for performance and cost reduction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function createDirectPublicClient<TChain extends Chain<any, any>>(
  config: Config,
  chain: TChain,
): PublicClient<Transport, TChain> {
  const [clientConfig, directConfig] = buildViemConfig(config, chain);
  const publicClient = createPublicClient(clientConfig);

  return extendDirectClient(publicClient, clientConfig, directConfig);
}

/**
 * Create a Viem Client, which wraps the DirectRPCClient and routes requests
 * through the Direct.dev infrastructure, adding read layer caching for
 * performance and cost reduction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDirectClient<TChain extends Chain<any, any>>(
  config: Config,
  chain: TChain,
): Client<Transport, TChain> {
  const [clientConfig, directConfig] = buildViemConfig(config, chain);
  const client = createClient(clientConfig);

  return extendDirectClient(client, clientConfig, directConfig);
}

/**
 * internal helper to streamline client configuration amongst exported creators
 */
export function buildViemConfig<TChain extends Chain>(
  config: Config,
  chain: TChain,
): [PublicClientConfig<Transport, TChain>, DirectRPCClientConfig] {
  const directConfig = buildDirectConfig(config, chain);

  return [
    {
      key: `direct-${directConfig.projectId}:${directConfig.networkId}`,
      name: `Direct.dev (${directConfig.networkId})`,
      chain,
      transport: () => createDirectViemTransport(directConfig),
    },
    directConfig,
  ];
}

/**
 * Build a DirectRPCClient object, automatically inferring network and failover
 * nodes from Viems chain object.
 */
export function buildDirectConfig(config: Config, _chain: Chain): DirectRPCClientConfig {
  // sonicTestnet doesn't actually exist, only sonicBlazeTestnet is valid
  const chain = _chain.id !== sonicTestnet.id ? _chain : sonicBlazeTestnet;

  const networkId = getNetworkIdFromChain(chain);
  const failover = config.failover ?? [...chain.rpcUrls.default.http];

  return {
    ...config,
    networkId,
    failover,
  };
}

/**
 * Create a Viem Transport which routes requests through a DirectRPCClient
 */
export function createDirectViemTransport(config: DirectRPCClientConfig): ReturnType<Transport> {
  const directClient = makeDirectRPCClient(config);
  let autoIncrementedId = 0;

  return createTransport(
    {
      type: "direct",
      key: `direct-${config.projectId}:${config.networkId}`,
      name: "Direct.dev Provider",
      retryCount: 0,
      retryDelay: 0,
      timeout: 60_000,
      async request(input: Omit<DirectRPCRequest, "id"> & Partial<DirectRPCRequest> & { jsonrpc?: string }) {
        const id = input.id ?? ++autoIncrementedId;
        const jsonrpc = input.jsonrpc ?? "2.0";

        const res = await directClient.fetch({
          ...input,
          id,
          jsonrpc,
        });

        if ("error" in res) {
          throw new RpcRequestError({
            body: res,
            error: res.error,
            url: directClient.endpointUrl,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return res.result as any;
      },
    },
    {
      // expose configuration used to instantiate DirectRPCClient for this
      // transport under TransportConfig
      directConfig: config,

      // expose url under TransportConfig, similar to native http
      // transport, ensuring compatibility with Wagmis proposed
      // `clientToProvider` implementation
      url: directClient.endpointUrl,
    },
  );
}

/**
 * Extend a Viem client to provide real-time receipts by overriding
 * waitForTransactionReceipt to use direct_getTransactionReceipt out of the box
 */
export function extendDirectClient<TClient extends Client>(
  client: TClient,
  clientConfig: ClientConfig,
  directConfig: DirectRPCClientConfig,
): TClient {
  const directClient = makeDirectRPCClient(directConfig);

  // override the public waitForTransactionReceipt, so that we can intercept
  // requests to eth_getTransactionReceipt and auto-transform them into
  // direct_getTransactionReceipt for real time result delivery
  (client as unknown as PublicClient).waitForTransactionReceipt = function waitForTransactionReceiptOverride(args) {
    // create a sub-client, on which we override the request method to perform
    // automatic upgrade of receipt requests without overriding built-in Viem
    // logic
    const subClient = createPublicClient(clientConfig) as PublicClient & {
      __directRequest: PublicClient["request"];
    };

    let requestCount = 0;

    subClient.__directRequest = subClient.request;
    subClient.request = function (args, options) {
      if (args.method === "eth_getTransactionReceipt") {
        args.method = "direct_getTransactionReceipt";

        if (++requestCount > 1 && Array.isArray(args.params)) {
          // inject `retry: true` parameter if we've run the request multiple
          // times, so that Direct.dev infrastructure can react correctly
          args.params = [
            args.params[0],
            {
              retry: true,
            },
          ];
        }
      }

      // run actual requests through the primary client, so that caches are
      // fully shared
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return subClient.__directRequest(args as any, options);
    };

    // override watchBlockNumber, so that it uses DirectRPCClients internal
    // watcher for real time observation of confirmation count instead of
    // polling
    subClient.watchBlockNumber = function watchBlockNumber(options) {
      return directClient.watchBlockHeight(
        (blockHeight, prevBlockHeight) => {
          // trigger the external callback with Viems expected signature
          options.onBlockNumber(BigInt(blockHeight), prevBlockHeight != null ? BigInt(prevBlockHeight) : undefined);
        },
        {
          emitMissed: options.emitMissed,
          emitOnBegin: options.emitOnBegin,
          pollingIntervalMs: options.pollingInterval ?? client.pollingInterval,

          // using `as Error` is technically unsafe, but it's what Viem does as
          // well - so mimic behaviour
          onError: (err) => options.onError?.(err as Error),
        },
      );
    };

    return waitForTransactionReceipt(subClient, args);
  };

  return client;
}

/**
 * internal utility to translate Viem chain object to Direct.dev network ID.
 */
function getNetworkIdFromChain(chain: Chain): SupportedNetworkId {
  switch (chain.id) {
    case mainnet.id:
      return "ethereum";
    case holesky.id:
      return "ethereum-holesky";
    case sepolia.id:
      return "ethereum-sepolia";

    case sonic.id:
      return "sonic";
    case sonicBlazeTestnet.id:
      return "sonic-blaze-testnet";
  }

  throw new Error("getNetworkIdFromChain(): unable to map chain to supported network id (Direct.dev)");
}
