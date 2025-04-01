import { it, expect } from "vitest";

import { supportedProviders } from "../constants.supported-providers.js";
import { deriveProviderFromNodeUrl } from "../util.derive-provider-from-node-url.js";

it("should infer correct provider for recognized URLs", () => {
  const nodeUrl = supportedProviders.drpc.networks.sonic?.at(0)?.replace("{apiKey}", "*****") ?? "";
  const providerId = deriveProviderFromNodeUrl("sonic", nodeUrl);

  expect(providerId).toBe("drpc");
});

it("should return undefined for unrecognized URLs", () => {
  expect(deriveProviderFromNodeUrl("sonic", "https://rpc.direct.dev/")).toBe(undefined);
});
