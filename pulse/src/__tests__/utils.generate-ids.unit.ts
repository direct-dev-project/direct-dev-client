import { it, expect } from "vitest";

import {
  generateTraceId,
  decodeTraceId,
  encodeTraceId,
  generateSpanId,
  encodeSpanId,
  decodeSpanId,
} from "../util.generate-ids.js";

it("should roundtrip traceIds correctly", () => {
  //
  // arrange
  //
  const traceId = generateTraceId();

  //
  // act
  //
  const encodedTraceId = encodeTraceId(traceId);
  const decodedTraceId = decodeTraceId(encodedTraceId);

  //
  // assert
  //
  expect(encodedTraceId.length).toBe(32);
  expect(decodedTraceId).toEqual(traceId);
});

it("should roundtrip spanIds correctly", () => {
  //
  // arrange
  //
  const spanId = generateSpanId();

  //
  // act
  //
  const encodedSpanId = encodeSpanId(spanId);
  const decodedSpanId = decodeSpanId(encodedSpanId);

  //
  // assert
  //
  expect(encodedSpanId.length).toBe(16);
  expect(decodedSpanId).toEqual(spanId);
});
