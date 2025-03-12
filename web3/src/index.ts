import { MethodNotImplementedError } from "web3-errors";
import type {
  EthExecutionAPI,
  JsonRpcResponseWithResult,
  Web3APIMethod,
  Web3APIPayload,
  Web3APIReturnType,
  Web3APISpec,
  Web3ProviderStatus,
} from "web3-types";
import { Web3BaseProvider } from "web3-types";

import type { DirectRPCClientConfig } from "@direct.dev/client";
import { DirectRPCClient } from "@direct.dev/client";

/**
 * web3.js wrapper for the DirectRPCClient, which routes requests through the
 * Direct.dev infrastructure, adding read layer caching for performance and
 * cost reduction.
 */
export class DirectWeb3Provider<API extends Web3APISpec = EthExecutionAPI> extends Web3BaseProvider<API> {
  readonly #directClient: DirectRPCClient;

  public constructor(config: DirectRPCClientConfig) {
    super();
    this.#directClient = new DirectRPCClient(config);
  }

  /**
   * run requests through the DirectRPCClient
   */
  public async request<Method extends Web3APIMethod<API>, ResultType = Web3APIReturnType<API, Method>>(
    payload: Web3APIPayload<API, Method>,
  ): Promise<JsonRpcResponseWithResult<ResultType>> {
    const response = await this.#directClient.fetch({
      ...payload,
      id: payload.id ?? 1,
      params: payload.params,
      jsonrpc: payload.jsonrpc ?? "2.0",
    });

    return {
      ...response,
      id: response.id,
      jsonrpc: payload.jsonrpc ?? "2.0",
    } as JsonRpcResponseWithResult<ResultType>;
  }

  //
  // unsupported methods
  //
  public supportsSubscriptions() {
    return false;
  }

  public getStatus(): Web3ProviderStatus {
    throw new MethodNotImplementedError();
  }

  public on() {
    throw new MethodNotImplementedError();
  }

  public removeListener() {
    throw new MethodNotImplementedError();
  }

  public once() {
    throw new MethodNotImplementedError();
  }

  public removeAllListeners() {
    throw new MethodNotImplementedError();
  }

  public connect() {
    throw new MethodNotImplementedError();
  }

  public disconnect() {
    throw new MethodNotImplementedError();
  }

  public reset() {
    throw new MethodNotImplementedError();
  }

  public reconnect() {
    throw new MethodNotImplementedError();
  }
}
