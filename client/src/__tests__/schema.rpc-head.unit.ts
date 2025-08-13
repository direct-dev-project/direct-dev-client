import { it, expect } from "vitest";

import { rpcHeadSchema } from "../schemas.js";

it("parses empty head", () => {
  expect(rpcHeadSchema({})).toEqual({});
});

it("parses valid blockHeight and date", () => {
  const result = rpcHeadSchema({
    blockHeight: "12345",
    blockHeightExpiresAt: new Date().toISOString(),
  });

  expect(result.blockHeight).toBe("12345");
  expect(result.blockHeightExpiresAt).toBeInstanceOf(Date);
});

it("parses null blockHeight and expiresAt", () => {
  const result = rpcHeadSchema({ blockHeight: null, blockHeightExpiresAt: null });
  expect(result.blockHeight).toBeNull();
  expect(result.blockHeightExpiresAt).toBeNull();
});

it("throws if blockHeight is invalid", () => {
  expect(() => rpcHeadSchema({ blockHeight: 42 })).toThrow(/blockHeight/);
});

it("throws if expiresAt is invalid", () => {
  expect(() => rpcHeadSchema({ blockHeightExpiresAt: 123 })).toThrow(/blockHeightExpiresAt/);
});
