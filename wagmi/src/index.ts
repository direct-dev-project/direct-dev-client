// eslint-disable-next-line import-x/no-extraneous-dependencies
import { RpcRequestError } from "viem";
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { custom } from "wagmi";
import type { Transport } from "wagmi";

import { DirectRPCClient, type DirectRPCClientConfig } from "@direct.dev/client";

/**
 * Create a Direct Wagmi transport, which wraps the DirectRPCClient and routes
 * requests to a specific network through the Direct.dev infrastructure, adding
 * read layer caching for performance and cost reduction.
 */
export function direct(config: DirectRPCClientConfig): Transport {
  const directClient = new DirectRPCClient(config);
  let autoIncrementedId = 0;

  return custom(
    {
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

        return res.result;
      },
    },
    {
      key: `direct-${config.networkId}`,
      name: "Direct.dev Provider",
      retryCount: 0,
    },
  );
}
