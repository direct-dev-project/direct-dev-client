import { it, expect } from "vitest";

import { normalizeRPCMethod } from "@direct.dev/shared";

import { hashRPCRequest } from "../structures.rpc-request.js";
import { hashRPCResponse } from "../structures.rpc-response.js";
import { syncHead, type SyncHead } from "../structures.sync-head.js";

async function fullSyncHead(): Promise<SyncHead> {
  return {
    clock: { t2: new Date(1000), t3: new Date(2000) },
    blockHeight: "0x123",
    pendingBlockHeight: {
      blockHeight: "0x456",
      propagatesAt: new Date(3000),
    },
    primer: {
      syncSet: [],
      revalidateSet: [],
      requestToResponseMap: [
        {
          requestHash: await hashRPCRequest({
            requestMethod: normalizeRPCMethod("eth_blockNumber"),
            requestBody: { id: 1, method: "eth_blockNumber", params: [] },
          }),
          responseHash: await hashRPCResponse({
            id: 1,
            result: "0x0",
          }),
          expiresAt: new Date(4000),
        },
      ],
    },
  };
}

// Keys in the same order as ComposedWire sees them
const fieldKeys: Array<keyof SyncHead> = ["clock", "blockHeight", "pendingBlockHeight", "primer"];

it("should encode+decode all bitmask combinations correctly", async () => {
  const base = await fullSyncHead();
  const total = 1 << fieldKeys.length;

  for (let mask = 0; mask < total; mask++) {
    const subset = {} as SyncHead;

    fieldKeys.forEach((fieldKey, bit) => {
      if (mask & (1 << bit)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subset[fieldKey] = base[fieldKey] as any;
      } else {
        subset[fieldKey] = undefined;
      }
    });

    const encoded = syncHead.encode(subset);
    const decoded = syncHead.decode(encoded);

    // Deep-equal JSON (dates serialized)
    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(JSON.parse(JSON.stringify(subset)));

    // Cursor should be at end
    expect(decoded[1]).toEqual(encoded.length);
  }
});
