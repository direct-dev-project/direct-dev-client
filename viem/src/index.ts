import type { Chain, PublicClient } from "viem";
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { createPublicClient, custom, RpcRequestError } from "viem";

import { DirectRPCClient, type DirectRPCClientConfig } from "@direct.dev/client";
import type { DirectRPCRequest } from "@direct.dev/shared";

/**
 * Create a Direct Viem client, which wraps the DirectRPCClient and routes
 * requests through the Direct.dev infrastructure, adding read layer caching
 * for performance and cost reduction.
 */
export function createDirectViemClient(config: DirectRPCClientConfig, chain?: Chain): PublicClient {
  const directClient = new DirectRPCClient(config);

  return createPublicClient({
    key: `direct-${config.projectId}:${config.networkId}`,
    name: `Direct.dev (${config.networkId})`,
    chain,
    transport: custom(
      {
        async request(input: Omit<DirectRPCRequest, "id"> & Partial<DirectRPCRequest> & { jsonrpc?: string }) {
          const res = await directClient.fetch({
            ...input,
            id: input.id ?? 1,
            jsonrpc: input.jsonrpc ?? "2.0",
          });

          if ("error" in res) {
            throw new RpcRequestError({
              body: res,
              error: res.error as { code: number; data?: unknown; message: string },
              url: "https://rpc.direct.dev/",
            });
          }

          return res.result;
        },
      },
      {
        key: `direct-${config.networkId}`,
        name: "Direct.dev Provider",
        retryCount: 0,
      },
    ),
  });
}
