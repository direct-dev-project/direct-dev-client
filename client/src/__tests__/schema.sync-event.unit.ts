import { it, expect } from "vitest";

import type { wire } from "@direct.dev/wire";

import { syncEventSchema } from "../schemas.js";

it("parses ping event", () => {
  const result = syncEventSchema({
    event: "ping",
    data: {
      blockHeight: "123",
      expiresAt: new Date().toISOString(),
    },
  });

  expect(result.event).toBe("ping");
  expect((result as wire.PingSyncEvent).data.blockHeight).toBe("123");
  expect((result as wire.PingSyncEvent).data.expiresAt).toBeInstanceOf(Date);
});

it("parses block-height.change event", () => {
  const result = syncEventSchema({
    event: "block-height.change",
    data: {
      blockHeight: "124",
      propagatesAt: new Date().toISOString(),
    },
  });
  expect(result.event).toBe("block-height.change");
  expect((result as wire.BlockHeightSyncEvent).data.blockHeight).toBe("124");
});

it("parses block-height.promote event", () => {
  const result = syncEventSchema({
    event: "block-height.promote",
    data: {
      blockHeight: "124",
    },
  });
  expect(result.event).toBe("block-height.promote");
  expect((result as wire.BlockHeightPromoteEvent).data.blockHeight).toBe("124");
});

it("parses cache.delta event", () => {
  const result = syncEventSchema({
    event: "cache.delta",
    data: {
      syncSet: {
        checksum: "1234567890abcdef123",
        added: ["1234567890abcdef456", "1234567890abcdef789"],
        removed: ["1234567890abcdefabc"],
      },
      revalidateSet: {
        checksum: "1234567890abcdef123",
        added: ["1234567890abcdef456", "1234567890abcdef789"],
        removed: ["1234567890abcdefabc"],
      },
    },
  });
  expect(result.event).toBe("cache.delta");
  expect((result as wire.CacheDeltaSyncEvent).data.syncSet.added).toContain("1234567890abcdef456");
});

it("parses cache.continuation event", () => {
  const result = syncEventSchema({
    event: "cache.continuation",
    data: {
      checksum: "1234567890abcdefghi",
      unchanged: [{ requestIndex: 0, expiresAt: new Date() }],
      patches: [{ requestIndex: 1, patchStr: "abc", expiresAt: new Date() }],
      replacements: [{ requestIndex: 2, response: { id: 1, result: "abc" }, expiresAt: new Date() }],
    },
  });
  expect(result.event).toBe("cache.continuation");
  expect((result as wire.CacheContinuationSyncEvent).data.checksum).toBe("1234567890abcdefghi");
  expect((result as wire.CacheContinuationSyncEvent).data.unchanged[0]?.requestIndex).toBe(0);
  expect((result as wire.CacheContinuationSyncEvent).data.patches[0]?.requestIndex).toBe(1);
  expect((result as wire.CacheContinuationSyncEvent).data.patches[0]?.patchStr).toBe("abc");
  expect((result as wire.CacheContinuationSyncEvent).data.replacements[0]?.requestIndex).toBe(2);
  expect((result as wire.CacheContinuationSyncEvent).data.replacements[0]?.response).toMatchObject({
    id: 1,
    result: "abc",
  });
});

it("throws on unknown event type", () => {
  expect(() => syncEventSchema({ event: "unknown", data: {} })).toThrow(/syncEvent did not match any union type/);
});

it("throws on malformed event structure", () => {
  expect(() => syncEventSchema(null)).toThrow(/must be a record/);
  expect(() => syncEventSchema({})).toThrow(/event/);
});
