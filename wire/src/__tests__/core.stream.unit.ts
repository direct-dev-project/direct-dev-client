import { it, expect } from "vitest";

import type { WireStreamSegment } from "../core.stream.js";
import { WireEncodeStream, WireDecodeStream } from "../core.stream.js";

it("roundtrips head, item, and tail", async () => {
  const input = [
    { type: "head", value: "metadata" },
    { type: "item", value: "data1" },
    { type: "item", value: "data2" },
    { type: "tail", value: "complete" },
  ] as const;

  const stream = encodeStream(input);
  const decoded = await decodeStream(stream);
  expect(decoded).toEqual(input);
});

it("supports gzip compression", async () => {
  const large = "x".repeat(10_000);
  const input = [
    { type: "head", value: "info" },
    { type: "item", value: large },
    { type: "tail", value: "end" },
  ] as const;

  const stream = encodeStream(input, true);
  const decoded = await decodeStream(stream);
  expect(decoded).toEqual(input);
});

it("throws if multiple tails are pushed", async () => {
  const stream = new WireEncodeStream();
  await stream.pushTail("end");
  await expect(() => stream.pushTail("end again")).rejects.toThrow();
});

it("throws if stream exceeds maximum allowed size", async () => {
  const stream = new WireEncodeStream({ maxSize: 100 });
  const big = "x".repeat(1000); // intentionally over limit
  await expect(() => stream.pushItem(big)).rejects.toThrow(/segment is larger than max stream size/);
});

it("throws if decode receives stream larger than allowed", async () => {
  const encoder = new WireEncodeStream();
  await encoder.pushItem("x".repeat(1_000)); // push over limit
  encoder.close();

  const decoder = new WireDecodeStream(encoder, { maxSize: 500 });
  const reader = decoder.getReader({
    head: (input) => input,
    item: (input) => input,
    tail: (input) => input,
  });
  await expect(() => reader.next()).rejects.toThrow(/maximum stream size has been exceeded/);
});

/**
 * utility to easily encode an array of provided segments onto a
 * WireEncodeStream
 */
function encodeStream(segments: readonly WireStreamSegment[], compress = false): WireEncodeStream {
  const stream = new WireEncodeStream();
  const opts = { compress };

  const run = async () => {
    for (const segment of segments) {
      if (segment.type === "head") await stream.pushHead(segment.value, opts);
      else if (segment.type === "item") await stream.pushItem(segment.value, opts);
      else if (segment.type === "tail") await stream.pushTail(segment.value, opts);
    }
    stream.close();
  };

  void run();
  return stream;
}

/**
 * utility to easily decode a WireEncodeStream and return the array of decoded
 * segments
 */
async function decodeStream(stream: ReadableStream<Uint8Array>) {
  const decoder = new WireDecodeStream(stream);
  const result: WireStreamSegment[] = [];
  for await (const segment of decoder.getReader({
    head: (input) => input,
    item: (input) => input,
    tail: (input) => input,
  })) {
    result.push(segment);
  }
  return result;
}
