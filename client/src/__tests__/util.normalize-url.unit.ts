import { it, expect } from "vitest";

import { normalizeContextFromUrl } from "../util.normalize-url.js";

it("should return a normalized URL with sorted query parameters and consistent hash", () => {
  const input = "https://example.com/path?z=1&x=2&y=3#section";
  const expected = "/path?x=2&y=3&z=1#section";
  expect(normalizeContextFromUrl(input)).toBe(expected);
});

it("should handle URLs without a hash fragment", () => {
  const input = "https://example.com/path?a=1&b=2";
  const expected = "/path?a=1&b=2#";
  expect(normalizeContextFromUrl(input)).toBe(expected);
});

it("should handle URLs with no query parameters", () => {
  const input = "https://example.com/path#section";
  const expected = "/path?#section";
  expect(normalizeContextFromUrl(input)).toBe(expected);
});

it("should normalize special characters in the query parameters", () => {
  const input = "https://example.com/path?a=hello%20world&b=goodbye%20earth";
  const expected = "/path?a=hello%20world&b=goodbye%20earth#";
  expect(normalizeContextFromUrl(input)).toBe(expected);
});

it("should handle URLs with empty search params correctly", () => {
  const input = "https://example.com/path?";
  const expected = "/path?#";
  expect(normalizeContextFromUrl(input)).toBe(expected);
});

it("should handle URLs with only a hash fragment and no query params", () => {
  const input = "https://example.com/path#hash";
  const expected = "/path?#hash";
  expect(normalizeContextFromUrl(input)).toBe(expected);
});

it("should handle edge case for empty URL input", () => {
  const input = "https://example.com/";
  const expected = "/?#";
  expect(normalizeContextFromUrl(input)).toBe(expected);
});
