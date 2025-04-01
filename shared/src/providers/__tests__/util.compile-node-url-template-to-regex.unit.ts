import { it, expect } from "vitest";

import { compileNodeUrlTemplateToRegEx } from "../util.compile-node-url-template-to-regex.js";

it("should correctly match expected URLs", () => {
  //
  // Arrange
  //
  const regex = compileNodeUrlTemplateToRegEx("https://{endpoint}.ethereum-sepolia.quiknode.pro/{apiKey}");
  const url = "https://{endpoint}.ethereum-sepolia.quiknode.pro/{apiKey}"
    .replace("{endpoint}", encodeURIComponent("complex string"))
    .replace("{apiKey}", encodeURIComponent("%!&"));

  //
  // Assert
  //
  expect(regex.test(url)).toBe(true);
});

it("should not match other URLs", () => {
  //
  // Arrange
  //
  const regex = compileNodeUrlTemplateToRegEx("https://{endpoint}.ethereum-sepolia.quiknode.pro/{apiKey}");

  //
  // Assert
  //
  expect(regex.test("https://direct.dev/")).toBe(false);
});
