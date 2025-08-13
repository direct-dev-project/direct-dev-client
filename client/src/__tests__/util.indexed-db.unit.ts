import { it, expect, beforeEach, vi } from "vitest";

import type { Logger } from "@direct.dev/shared";

import type { CacheDatabase } from "../util.indexed-db.js";
import { makeDB } from "../util.indexed-db.js";

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

let db: CacheDatabase;

beforeEach(async () => {
  // ensure DB is cleared between tests
  await new Promise<void>((resolve, reject) => {
    const deleteReq = indexedDB.deleteDatabase("direct.dev_test-project_mainnet");
    deleteReq.onsuccess = () => resolve();
    deleteReq.onerror = () => reject(deleteReq.error);
    deleteReq.onblocked = () => resolve();
  });

  // re-create a fresh database
  db = makeDB(mockLogger as unknown as Logger, "test-project", "mainnet");
  mockLogger.warn.mockClear();
});

it("should set and get a value", async () => {
  await db.set("foo", "bar");
  const result = await db.get("foo");
  expect(result).toBe("bar");
});

it("should return undefined for missing keys", async () => {
  const result = await db.get("does-not-exist");
  expect(result).toBeUndefined();
});

it("should delete a key", async () => {
  await db.set("temp", "value");
  await db.delete("temp");
  const result = await db.get("temp");
  expect(result).toBeUndefined();
});

it("should handle batch setMany and get", async () => {
  await db.setMany([
    { key: "a", value: "1" },
    { key: "b", value: "2" },
  ]);
  expect(await db.get("a")).toBe("1");
  expect(await db.get("b")).toBe("2");
});

it("should handle batch deleteMany", async () => {
  await db.set("x", "123");
  await db.set("y", "456");
  await db.deleteMany(["x", "y"]);
  expect(await db.get("x")).toBeUndefined();
  expect(await db.get("y")).toBeUndefined();
});

it("should log a warning if IndexedDB fails to open", async () => {
  const failingDB = makeDB(mockLogger as unknown as Logger, "test-fail", "badstore");

  // Simulate failure by overwriting indexedDB.open to always error
  const originalOpen = indexedDB.open;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (indexedDB.open as any) = () => {
    const req = {} as IDBOpenDBRequest;
    setTimeout(() => req.onerror?.(new Event("error")));
    return req;
  };

  await expect(failingDB.get("any")).resolves.toBeUndefined();
  expect(mockLogger.warn).toHaveBeenCalledWith(
    "makeDB",
    "unable to open IndexedDB for persistent cache",
    expect.anything(),
  );

  indexedDB.open = originalOpen; // restore
});

it("should iterate all values using getAll", async () => {
  await db.setMany([
    { key: "k1", value: "v1" },
    { key: "k2", value: "v2" },
    { key: "k3", value: "v3" },
  ]);

  const entries = new Map<string, string>();

  for await (const [key, value] of db.getAll()) {
    entries.set(key, value);
  }

  expect(entries.size).toBe(3);
  expect(entries.get("k1")).toBe("v1");
  expect(entries.get("k2")).toBe("v2");
  expect(entries.get("k3")).toBe("v3");
});
