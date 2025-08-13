import { it, expect } from "vitest";

import { syncHeadSchema } from "../schemas.js";

it("parses minimal head", () => {
  const result = syncHeadSchema({ blockHeight: "100" });
  expect(result.blockHeight).toBe("100");
});

it("parses full head with pending block and cache", () => {
  const input = {
    blockHeight: "100",
    clock: {
      t2: new Date().toISOString(),
      t3: new Date(),
    },
    pendingBlockHeight: {
      blockHeight: "101",
      propagatesAt: new Date().toISOString(),
    },
    primer: {
      syncSet: [],
      revalidateSet: [],
      requestToResponseMap: [
        {
          requestHash: "abc",
          responseHash: "def",
          expiresAt: new Date().toISOString(),
        },
      ],
    },
  };

  const result = syncHeadSchema(input);
  expect(result.pendingBlockHeight?.blockHeight).toBe("101");
  expect(result.primer?.requestToResponseMap?.[0]?.requestHash).toBe("abc");
  expect(JSON.stringify(input)).toEqual(JSON.stringify(result));
});

it("throws if blockHeight is not a string", () => {
  expect(() => syncHeadSchema({ blockHeight: 100 })).toThrow(/blockHeight/);
});

it("throws if pendingBlockHeight is malformed", () => {
  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      pendingBlockHeight: { blockHeight: 1 },
    }),
  ).toThrow(/pendingBlockHeight/);
});

it("throws if primer.syncSet is malformed", () => {
  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      primer: {
        revalidateSet: [],
        requestToResponseMap: [
          {
            requestHash: "123",
            responseHash: "abc",
            expiresAt: new Date(),
          },
        ],
      },
    }),
  ).toThrow(/primer.syncSet/);

  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      primer: {
        syncSet: {},
        revalidateSet: [],
        requestToResponseMap: [
          {
            requestHash: "123",
            responseHash: "abc",
            expiresAt: new Date(),
          },
        ],
      },
    }),
  ).toThrow(/primer.syncSet/);

  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      primer: {
        syncSet: [123],
        revalidateSet: [],
        requestToResponseMap: [
          {
            requestHash: "123",
            responseHash: "abc",
            expiresAt: new Date(),
          },
        ],
      },
    }),
  ).toThrow(/primer.syncSet/);
});

it("throws if primer.revalidateSet is malformed", () => {
  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      primer: {
        syncSet: [],
        requestToResponseMap: [
          {
            requestHash: "123",
            responseHash: "abc",
            expiresAt: new Date(),
          },
        ],
      },
    }),
  ).toThrow(/primer.revalidateSet/);

  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      primer: {
        syncSet: [],
        revalidateSet: {},
        requestToResponseMap: [
          {
            requestHash: "123",
            responseHash: "abc",
            expiresAt: new Date(),
          },
        ],
      },
    }),
  ).toThrow(/primer.revalidateSet/);

  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      primer: {
        syncSet: [],
        revalidateSet: [123],
        requestToResponseMap: [
          {
            requestHash: "123",
            responseHash: "abc",
            expiresAt: new Date(),
          },
        ],
      },
    }),
  ).toThrow(/primer.revalidateSet/);
});

it("throws if primer.requestToResponseMap is malformed", () => {
  expect(() =>
    syncHeadSchema({
      blockHeight: "100",
      primer: {
        syncSet: [],
        revalidateSet: [],
        requestToResponseMap: [
          {
            requestHash: "123",
            responseHash: "abc",
            expiresAt: "not-a-date",
          },
        ],
      },
    }),
  ).toThrow(/primer.requestToResponseMap/);
});
