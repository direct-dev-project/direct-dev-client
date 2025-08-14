// eslint-disable-next-line import-x/no-extraneous-dependencies
import { getNumber, JsonRpcProvider, makeError } from "ethers";
import type { JsonRpcPayload, JsonRpcResult, Networkish, TransactionReceipt, TransactionReceiptParams } from "ethers";

import { makeDirectRPCClient } from "@direct.dev/client";
import type { DirectRPCClient, DirectRPCClientConfig } from "@direct.dev/client";

/**
 * Ethers provider wrapping the DirectRPCClient, which routes requests through
 * the Direct.dev infrastructure, adding read layer caching for performance and
 * cost reduction.
 */
export default class DirectProvider extends JsonRpcProvider {
  /**
   * instantiation of the core DirectRPCClient used to intercept and perform
   * RPC requests under the hood.
   */
  readonly #directClient: DirectRPCClient;

  constructor(config: DirectRPCClientConfig, network?: Networkish) {
    super(undefined, network, { staticNetwork: true, batchStallTime: 0 });

    this.#directClient = makeDirectRPCClient(config);
  }

  /**
   * send RPC requests through the Direct core client.
   */
  async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const res = await this.#directClient.fetch(payload);

    return Array.isArray(res) ? (res as JsonRpcResult[]) : ([res] as JsonRpcResult[]);
  }

  /**
   * override waitForTransaction calls to automatically transform
   * eth_getTransactionReceipt into direct_getTransactionReceipt for realtime
   * delivery of receipts without polling.
   */
  async waitForTransaction(
    hash: string,
    _confirms?: null | number,
    _timeout?: null | number,
  ): Promise<null | TransactionReceipt> {
    const confirms = _confirms ?? 1;
    const timeout = _timeout ?? 0;
    const startedAt = Date.now();

    if (confirms === 0) {
      // if no confirmations are requested, return transaction receipt directly
      // without polling - mimic'ing Ethers native functionality
      return this.getTransactionReceipt(hash);
    }

    // ... otherwise iteratively run direct_getTransactionReceipt for real time
    // delivery of responses
    let receipt: TransactionReceipt | undefined;
    let attempt = 0;

    do {
      const res = await this.#directClient.fetch({
        id: 1,
        jsonrpc: "2.0",
        method: "direct_getTransactionReceipt",
        params: [
          hash,
          {
            retry: attempt++ > 0,
          },
        ],
      });

      if ("result" in res && res.result) {
        receipt = this._wrapTransactionReceipt(res.result as TransactionReceiptParams, await this.getNetwork());
        break;
      }
    } while (timeout > Date.now() - startedAt);

    if (!receipt) {
      // bail out immediately if we were unable to retrieve a transaction
      // receipt within the designated timeout
      return null;
    }

    if (confirms === 1) {
      // if only a single confirmation is required, then return the receipt
      // right away (it's inherently confirmed by being fetched)
      return receipt;
    }

    // ... otherwise subscribe to block height change events and wait with
    // resolving until the desired number of confirmations have been reached
    const confirmedReceipt = receipt;

    return new Promise((resolve, reject) => {
      let abortTimeout: NodeJS.Timeout | number | undefined;

      const handleBlockHeightChange = (blockHeight: RPCBlockHeight) => {
        const blockNumber = getNumber(blockHeight);

        if (blockNumber - confirmedReceipt.blockNumber + 1 >= confirms) {
          disconnectWatcher();
          clearTimeout(abortTimeout);
          resolve(confirmedReceipt);
          return;
        }
      };

      if (_timeout != null) {
        // if timeout has been confirmed, then ensure that we bail out if
        // unable to fetch the desired number of confirmations
        abortTimeout = setTimeout(
          () => {
            disconnectWatcher();
            reject(makeError("timeout", "TIMEOUT", { reason: "timeout" }));
          },
          Math.max(0, _timeout - (Date.now() - startedAt)),
        );
      }

      const disconnectWatcher = this.#directClient.watchBlockHeight(handleBlockHeightChange, {
        emitOnBegin: true,
        pollingIntervalMs: this.pollingInterval,
      });
    });
  }
}
