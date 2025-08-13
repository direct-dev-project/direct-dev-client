import { getBlockHeightParam } from "./block-height.param.js";

/**
 * perform in-depth inspection of an RPC request in order to determine if we
 * allow automatic revalidation
 */
export function mayRPCRequestRevalidate(input: {
  requestMethod: DirectRequestMethod;
  requestBody: DirectRPCRequest;
  requestBlockHeight: RPCBlockHeight | undefined;
}): boolean {
  switch (input.requestMethod) {
    case "eth_getBlockByNumber": {
      // eth_getBlockByNumber can be exceptionally heavy if the response
      // includes transactions AND revalidation occurs frequently
      const blockHeightParam = getBlockHeightParam(input);

      const updatesFrequently =
        blockHeightParam === "latest" ||
        blockHeightParam === "pending" ||
        blockHeightParam === input.requestBlockHeight;
      const includeTX = Array.isArray(input.requestBody.params) ? input.requestBody.params[1] === true : false;

      return !updatesFrequently || !includeTX;
    }

    default:
      // all other requests are inherently capable of being revalidated, if
      // otherwise eligible
      return true;
  }
}

/**
 * perform in-depth inspection of an RPC request in order to determine if we
 * allow syncing responses to clients in real time
 */
export function mayRPCRequestSync(input: {
  requestMethod: DirectRequestMethod;
  requestBody: DirectRPCRequest;
  requestBlockHeight: RPCBlockHeight | undefined;
}): boolean {
  switch (input.requestMethod) {
    case "eth_getBlockByNumber": {
      // eth_getBlockByNumber generally doesn't patch well, so never auto-sync
      // the value if it's pointing to a block tag that will change frequently
      const blockHeightParam = getBlockHeightParam(input);

      const updatesFrequently =
        blockHeightParam === "latest" ||
        blockHeightParam === "pending" ||
        blockHeightParam === input.requestBlockHeight;

      return !updatesFrequently;
    }

    default:
      // all other requests are inherently capable of being revalidated, if
      // otherwise eligible
      return true;
  }
}
