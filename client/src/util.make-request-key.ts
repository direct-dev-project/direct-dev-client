import { getBlockHeightParam, normalizeRPCMethod } from "@direct.dev/shared";
import { wire } from "@direct.dev/wire";

/**
 * generate a stable and safe cache key for requests
 */
export async function makeRequestKey(
  requestBody: DirectRPCRequest,
  blockHeight: RPCBlockHeight | undefined,
): Promise<DirectCacheKey> {
  const requestMethod = normalizeRPCMethod(requestBody.method);
  const blockHeightParam = getBlockHeightParam({ requestBody, requestMethod });

  switch (blockHeightParam) {
    case "latest":
    case "implicit-latest":
    case blockHeight ?? "-": {
      // for requests targetting "latest" block height, ensure consistent cache
      // key usage to allow correct matching for predictively prefetched
      // requests
      const requestHash = await wire.hashRPCRequest({
        requestBody: { ...requestBody, __overrideBlockHeight: "latest" },
        requestMethod,
      });

      return `${requestHash}:${blockHeight as RPCBlockHeight}`;
    }

    default:
      return await wire.hashRPCRequest({ requestBody, requestMethod });
  }
}
