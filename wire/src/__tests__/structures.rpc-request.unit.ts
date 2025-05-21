import { describe, it, expect } from "vitest";

import type { RPCRequestStructure } from "../structures.rpc-request.js";
import { hashRPCRequest, RPCRequest } from "../structures.rpc-request.js";

describe("wire.RPCRequest", () => {
  it("should encode+decode direct_primer correctly", () => {
    const input: RPCRequestStructure = {
      method: "direct_primer",
      id: 1,
      params: ["/"],
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_blockNumber correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_blockNumber",
      id: 1,
      params: [],
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_call correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_call",
      params: [{ to: "0xc46fab3af8aa7a56feda351a22b56749da313473", data: "0xc4a7761e" }, "latest"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_call with blockHeight override correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_call",
      params: [{ to: "0xc46fab3af8aa7a56feda351a22b56749da313473", data: "0xc4a7761e" }, "0x1"],
      id: 1,
    };

    expect(RPCRequest.encode({ ...input, __overrideBlockHeight: "latest" })).toEqual(
      RPCRequest.encode({ ...input, params: [input.params[0], "latest"] }),
    );
  });

  it("should encode+decode eth_chainId correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_chainId",
      params: [],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_gasPrice correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_gasPrice",
      params: [],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getBalance correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getBalance",
      params: ["0x1", "0x2"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getBalance with blockHeight override correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getBalance",
      params: ["0x1", "0x2"],
      id: 1,
    };

    expect(RPCRequest.encode({ ...input, __overrideBlockHeight: "latest" })).toEqual(
      RPCRequest.encode({ ...input, params: [input.params[0], "latest"] }),
    );
  });

  it("should encode+decode eth_getBlockByHash correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getBlockByHash",
      params: ["0x1", true],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getBlockByNumber correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getBlockByNumber",
      params: ["0x1", true],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getBlockTransactionCountByHash correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getBlockTransactionCountByHash",
      params: ["0x1"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getBlockTransactionCountByNumber correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getBlockTransactionCountByNumber",
      params: ["0x1"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getCode correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getCode",
      params: ["0x1", "latest"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getCode with blockHeight override correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getCode",
      params: ["0x1", "0x2"],
      id: 1,
    };

    expect(RPCRequest.encode({ ...input, __overrideBlockHeight: "latest" })).toEqual(
      RPCRequest.encode({ ...input, params: [input.params[0], "latest"] }),
    );
  });

  it("should encode+decode eth_getStorageAt correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getStorageAt",
      params: ["0x1", "0x2", "latest"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getStorageAt with blockHeight override correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getStorageAt",
      params: ["0x1", "0x2", "0x3"],
      id: 1,
    };

    expect(RPCRequest.encode({ ...input, __overrideBlockHeight: "latest" })).toEqual(
      RPCRequest.encode({ ...input, params: [input.params[0], input.params[1], "latest"] }),
    );
  });

  it("should encode+decode eth_getTransactionByBlockHashAndIndex correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getTransactionByBlockHashAndIndex",
      params: ["0x1", "0x2"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getTransactionByBlockNumberAndIndex correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getTransactionByBlockNumberAndIndex",
      params: ["0x1", "0x2"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getTransactionByHash correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getTransactionByHash",
      params: ["0x1"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getTransactionCount correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getTransactionCount",
      params: ["0x1", "0x2"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getTransactionCount with blockHeight override correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getTransactionCount",
      params: ["0x1", "0x2"],
      id: 1,
    };

    expect(RPCRequest.encode({ ...input, __overrideBlockHeight: "latest" })).toEqual(
      RPCRequest.encode({ ...input, params: [input.params[0], "latest"] }),
    );
  });

  it("should encode+decode eth_getTransactionReceipt correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getTransactionReceipt",
      params: ["0x1"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getUncleByBlockHashAndIndex correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getUncleByBlockHashAndIndex",
      params: ["0x1", "0x2"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getUncleByBlockNumberAndIndex correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getUncleByBlockNumberAndIndex",
      params: ["0x1", "0x2"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getUncleCountByBlockHash correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getUncleCountByBlockHash",
      params: ["0x1"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode eth_getUncleCountByBlockNumber correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getUncleCountByBlockNumber",
      params: ["0x1"],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });

  it("should encode+decode other methods correctly", () => {
    const input: RPCRequestStructure = {
      method: "eth_getLogs",
      params: [
        {
          topics: ["0x000000000000000000000000a94f5374fce5edbc8e2a8697c15331677e6ebf0b"],
        },
      ],
      id: 1,
    };
    const encoded = RPCRequest.encode(input);
    const decoded = RPCRequest.decode(encoded);

    expect(JSON.parse(JSON.stringify(decoded[0]))).toEqual(input);
    expect(decoded[1]).toEqual(encoded.length);
  });
});

describe("hashRPCRequest", () => {
  it("omits unwanted keys from hashes", async () => {
    //
    // act
    //
    const hash1 = await hashRPCRequest({ requestBody: { id: 1, method: "eth_getBalance", params: ["0x0", "0x0"] } });
    const hash2 = await hashRPCRequest({ requestBody: { id: 2, method: "eth_getBalance", params: ["0x0", "0x0"] } });

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
      requestBody: {
        id: 1,
        method: "eth_call",
        params: [
          {
            to: "0x0",
            from: "0x0",
          },
          "latest",
        ],
      },
    });
    const hash2 = await hashRPCRequest({
      requestBody: {
        id: 2,
        method: "eth_call",
        params: [
          {
            from: "0x0",
            to: "0x0",
          },
          "latest",
        ],
      },
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
      requestBody: {
        id: 1,
        method: "eth_call",
        params: [
          {
            to: "0x0",
            from: "0x0",
          },
          "latest",
        ],
      },
    });
    const hash2 = await hashRPCRequest({
      requestBody: {
        id: 2,
        method: "eth_call",
        params: [
          {
            to: "0x1",
            from: "0x0",
          },
          "latest",
        ],
      },
    });

    //
    // assert
    //
    expect(hash1).not.toEqual(hash2);
  });
});
