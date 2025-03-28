import type { JsonRpcPayload, JsonRpcResult, Networkish } from "ethers";
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { JsonRpcProvider } from "ethers";

import type { DirectRPCClientConfig } from "@direct.dev/client";
import { DirectRPCClient } from "@direct.dev/client";

/**
 * Ethers provider wrapping the DirectRPCClient, which routes requests through
 * the Direct.dev infrastructure, adding read layer caching for performance and
 * cost reduction.
 */
export class DirectEthersProvider extends JsonRpcProvider {
  readonly #directClient: DirectRPCClient;

  constructor(config: DirectRPCClientConfig, network?: Networkish) {
    super(undefined, network, { staticNetwork: true });
    this.#directClient = new DirectRPCClient(config);
  }

  async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const res = await this.#directClient.fetch(payload);

    return Array.isArray(res) ? (res as JsonRpcResult[]) : ([res] as JsonRpcResult[]);
  }
}
