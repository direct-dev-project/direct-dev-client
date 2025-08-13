// eslint-disable-next-line import-x/no-extraneous-dependencies
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import type { Networkish, TransactionReceipt } from "@ethersproject/providers";

import type { DirectRPCClient, DirectRPCClientConfig } from "@direct.dev/client";
import { makeDirectRPCClient } from "@direct.dev/client";

/**
 * Ethers provider wrapping the DirectRPCClient, which routes requests through
 * the Direct.dev infrastructure, adding read layer caching for performance and
 * cost reduction.
 */
export default class DirectProvider extends StaticJsonRpcProvider {
  /**
   * instantiation of the core DirectRPCClient used to intercept and perform
   * RPC requests under the hood.
   */
  readonly #directClient: DirectRPCClient;

  /**
   * specifies if waitForTransaction has been called, allowing us to opt into
   * direct_getTransactionReceipt for real time receipts automatically without
   * interfering with other calls
   */
  #isWaitingForTransaction = false;

  /**
   * auto-incremented request ID used for dispatched requests
   */
  #autoIncrementedId = 0;

  constructor(
    config: Omit<DirectRPCClientConfig, "failover"> & {
      failover?: DirectRPCClientConfig["failover"];
    },
    network?: Networkish,
  ) {
    super(undefined, network);

    this.#directClient = makeDirectRPCClient({
      ...config,
      failover: config.failover ?? [defaultFailoverUrls[config.networkId]],
    });
  }

  /**
   * send RPC requests through the Direct core client.
   */
  async send(method: string, params: unknown[]): Promise<unknown> {
    const result = await this.#directClient.fetch({
      id: ++this.#autoIncrementedId,
      jsonrpc: "2.0",
      method,
      params,
    });

    if ("error" in result) {
      throw new Error(result.error.message || "Unknown JSON-RPC error");
    }

    return result.result;
  }

  /**
   * intercept calls to waitForTransaction, and opt-in to
   * direct_getTransactionReceipt only when necessary
   */
  waitForTransaction(transactionHash: string, confirmations?: number, timeout?: number): Promise<TransactionReceipt> {
    this.#isWaitingForTransaction = true;
    const res = super.waitForTransaction(transactionHash, confirmations, timeout);
    this.#isWaitingForTransaction = false;

    return res;
  }

  /**
   * override the getTransactionReceipt method, which has built-in polling
   * behaviour in Ethers, using direct_getTransactionReceipt for faster
   * delivery of results
   */
  async getTransactionReceipt(transactionHash: string | Promise<string>): Promise<TransactionReceipt> {
    if (!this.#isWaitingForTransaction) {
      // if we're not currently waiting for a transaction, then run the
      // built-in callback
      return super.getTransactionReceipt(transactionHash);
    }

    // ... otherwise trigger direct_getTransactionReceipt initially for real
    // time delivery of receipts
    const res = await this.#directClient.fetch({
      id: 1,
      jsonrpc: "2.0",
      method: "direct_getTransactionReceipt",
      params: [await transactionHash],
    });

    if ("result" in res && res.result) {
      // if a receipt was received, then create it and assume confirmation
      // count of 1 due to real time delivery
      const receipt = this.formatter.receipt(res.result);
      receipt.confirmations = 1;

      return receipt;
    }

    // ... if we get here, no transaction receipt was found within the 45s
    // timeout; fallback to built-in polling behaviour to reduce complexity of
    // Direct.dev overrides (after 45s, real time delivery becomes less
    // significant to end-users anyway)
    return super.getTransactionReceipt(transactionHash);
  }
}

/**
 * mapping of default failover node URLs
 */
const defaultFailoverUrls: Record<SupportedNetworkId, string> = {
  ethereum: "https://eth.merkle.io",
  "ethereum-holesky": "https://ethereum-holesky-rpc.publicnode.com",
  "ethereum-sepolia": "https://sepolia.drpc.org",

  sonic: "https://rpc.soniclabs.com",
  "sonic-blaze-testnet": "https://rpc.blaze.soniclabs.com",
};
