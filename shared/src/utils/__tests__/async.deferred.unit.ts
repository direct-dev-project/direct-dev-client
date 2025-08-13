import { it, expect } from "vitest";

import { makeDeferred } from "../async.deferred.js";

it("should reslove with the provided value", async () => {
  const promise = makeDeferred<string>();

  promise.__resolve("test");

  expect(await promise).toBe("test");
});

it("should reject with the provided reason", async () => {
  const promise = makeDeferred<string>();

  promise.__reject("test");

  expect(
    await promise.catch((reason) => ({
      reason,
    })),
  ).toMatchObject({ reason: "test" });
});

it("should throw if trying to resolve/reject after already resolving", async () => {
  const promise = makeDeferred<string>();

  promise.__resolve("test");

  expect(() => promise.__resolve("test")).toThrow();
  expect(() => promise.__reject("test")).toThrow();
});

it("should throw if trying to resolve/reject after already rejecting", async () => {
  const promise = makeDeferred<string>();

  // suppress warning from Vitest about unhandled rejection
  promise.catch(() => {
    /** noop */
  });

  promise.__reject("test");

  expect(() => promise.__resolve("test")).toThrow();
  expect(() => promise.__reject("test")).toThrow();
});
