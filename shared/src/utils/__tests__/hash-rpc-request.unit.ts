import { it, expect } from "vitest";

import { hashRPCRequest } from "../hash-rpc-request.js";

it("omits unwanted keys from hashes", async () => {
  //
  // act
  //
  const hash1 = await hashRPCRequest({ id: 1, method: "eth_accounts", params: [] });
  const hash2 = await hashRPCRequest({ id: 2, method: "eth_accounts", params: [] });

  //
  // assert
  //
  expect(hash1).toEqual(hash2);
});

it("is consistent regardless of key ordering in input", async () => {
  //
  // act
  //
  const hash1 = await hashRPCRequest({
    id: 1,
    method: "eth_call",
    params: [
      {
        to: "0x0",
        from: "0x0",
      },
      "latest",
    ],
  });
  const hash2 = await hashRPCRequest({
    id: 2,
    method: "eth_call",
    params: [
      {
        from: "0x0",
        to: "0x0",
      },
      "latest",
    ],
  });

  //
  // assert
  //
  expect(hash1).toEqual(hash2);
});

it("is unique when provided with different input values", async () => {
  //
  // act
  //
  const hash1 = await hashRPCRequest({
    id: 1,
    method: "eth_call",
    params: [
      {
        to: "0x0",
        from: "0x0",
      },
      "latest",
    ],
  });
  const hash2 = await hashRPCRequest({
    id: 2,
    method: "eth_call",
    params: [
      {
        to: "0x1",
        from: "0x0",
      },
      "latest",
    ],
  });

  //
  // assert
  //
  expect(hash1).not.toEqual(hash2);
});
