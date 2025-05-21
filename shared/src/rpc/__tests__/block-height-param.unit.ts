import { describe, it, expect } from "vitest";

import { getBlockHeightParam, setBlockHeightParam } from "@direct.dev/shared";

describe("getBlockHeightParam", () => {
  it("extracts the expected blockHeight param from request samples", async () => {
    //
    // arrange
    //
    const cases: Array<{
      request: {
        requestBody: DirectRPCRequest;
        requestMethod: string;
      };
      blockHeight: RPCBlockHeightParam | "implicit-latest" | undefined;
    }> = [
      {
        request: {
          requestBody: {
            method: "eth_call",
            params: [
              {
                to: "0x0",
              },
              "earliest",
            ],
            id: 1,
          },
          requestMethod: "eth_call",
        },
        blockHeight: "earliest",
      },
      {
        request: {
          requestBody: {
            method: "eth_getBalance",
            params: ["0x0", "safe"],
            id: 1,
          },
          requestMethod: "eth_getBalance",
        },
        blockHeight: "safe",
      },
      {
        request: {
          requestBody: {
            method: "eth_getBlockByNumber",
            params: ["finalized", true],
            id: 1,
          },
          requestMethod: "eth_getBlockByNumber",
        },
        blockHeight: "finalized",
      },
      {
        request: {
          requestBody: {
            method: "eth_getBlockTransactionCountByNumber",
            params: ["pending"],
            id: 1,
          },
          requestMethod: "eth_getBlockTransactionCountByNumber",
        },
        blockHeight: "pending",
      },
      {
        request: {
          requestBody: {
            method: "eth_getCode",
            params: ["0x0", "0x1"],
            id: 1,
          },

          requestMethod: "eth_getCode",
        },
        blockHeight: "0x1",
      },
      {
        request: {
          requestBody: {
            method: "eth_getStorageAt",
            params: ["0x0", "0x1", "0x2"],
            id: 1,
          },
          requestMethod: "eth_getStorageAt",
        },
        blockHeight: "0x2",
      },
      {
        request: {
          requestBody: {
            method: "eth_getTransactionByBlockNumberAndIndex",
            params: ["0x0", "0x1"],
            id: 1,
          },
          requestMethod: "eth_getTransactionByBlockNumberAndIndex",
        },
        blockHeight: "0x0",
      },
      {
        request: {
          requestBody: {
            method: "eth_getTransactionCount",
            params: ["0x0", "0x1"],
            id: 1,
          },
          requestMethod: "eth_getTransactionCount",
        },
        blockHeight: "0x1",
      },
      {
        request: {
          requestBody: {
            method: "eth_getUncleByBlockNumberAndIndex",
            params: ["0x0", "0x1"],
            id: 1,
          },
          requestMethod: "eth_getUncleByBlockNumberAndIndex",
        },
        blockHeight: "0x0",
      },
      {
        request: {
          requestBody: {
            method: "eth_getUncleCountByBlockNumber",
            params: ["0x0"],
            id: 1,
          },
          requestMethod: "eth_getUncleCountByBlockNumber",
        },
        blockHeight: "0x0",
      },
      {
        request: {
          requestBody: {
            method: "eth_blockNumber",
            params: [],
            id: 1,
          },
          requestMethod: "eth_blockNumber",
        },
        blockHeight: "implicit-latest",
      },
      {
        request: {
          requestBody: {
            method: "eth_chainId",
            params: [],
            id: 1,
          },
          requestMethod: "eth_chainId",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_gasPrice",
            params: [],
            id: 1,
          },
          requestMethod: "eth_gasPrice",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_getBlockByHash",
            params: ["0x0", true],
            id: 1,
          },
          requestMethod: "eth_getBlockByHash",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_getBlockTransactionCountByHash",
            params: ["0x0"],
            id: 1,
          },
          requestMethod: "eth_getBlockTransactionCountByHash",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_getTransactionByBlockHashAndIndex",
            params: ["0x0", "0x1"],
            id: 1,
          },
          requestMethod: "eth_getTransactionByBlockHashAndIndex",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_getTransactionByHash",
            params: ["0x0"],
            id: 1,
          },
          requestMethod: "eth_getTransactionByHash",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_getTransactionReceipt",
            params: ["0x0"],
            id: 1,
          },
          requestMethod: "eth_getTransactionReceipt",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_getUncleByBlockHashAndIndex",
            params: ["0x0", "0x1"],
            id: 1,
          },
          requestMethod: "eth_getUncleByBlockHashAndIndex",
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_getUncleCountByBlockHash",
            params: ["0x0"],
            id: 1,
          },
          requestMethod: "eth_getUncleCountByBlockHash",
        },
        blockHeight: undefined,
      },
    ];

    //
    // assert
    //

    for (const it of cases) {
      expect(getBlockHeightParam(it.request)).toBe(it.blockHeight);
    }
  });
});

describe("setBlockHeightParam", () => {
  it("doesn't manipulate the original request", async () => {
    //
    // arrange
    //
    const dummyRequest: {
      requestBody: DirectRPCRequest;
      requestMethod: string;
    } = {
      requestBody: {
        method: "eth_call",
        params: [
          {
            to: "0x0",
          },
          "earliest",
        ],
        id: 1,
      },
      requestMethod: "eth_call",
    };

    //
    // assert
    //
    expect(setBlockHeightParam(dummyRequest, "0x0")).not.toBe(dummyRequest);
  });

  it("sets the parameter correctly on the request", async () => {
    //
    // arrange
    //
    const cases: Array<{
      requestBody: DirectRPCRequest;
      requestMethod: string;
    }> = [
      {
        requestBody: {
          method: "eth_call",
          params: [
            {
              to: "0x0",
            },
            "0x0",
          ],
          id: 1,
        },
        requestMethod: "eth_call",
      },
      {
        requestBody: {
          method: "eth_getBalance",
          params: ["0x0", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getBalance",
      },
      {
        requestBody: {
          method: "eth_getBlockByNumber",
          params: ["0x0", true],
          id: 1,
        },
        requestMethod: "eth_getBlockByNumber",
      },
      {
        requestBody: {
          method: "eth_getBlockTransactionCountByNumber",
          params: ["0x0"],
          id: 1,
        },
        requestMethod: "eth_getBlockTransactionCountByNumber",
      },
      {
        requestBody: {
          method: "eth_getCode",
          params: ["0x0", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getCode",
      },
      {
        requestBody: {
          method: "eth_getStorageAt",
          params: ["0x0", "0x1", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getStorageAt",
      },
      {
        requestBody: {
          method: "eth_getTransactionByBlockNumberAndIndex",
          params: ["0x0", "0x1"],
          id: 1,
        },
        requestMethod: "eth_getTransactionByBlockNumberAndIndex",
      },
      {
        requestBody: {
          method: "eth_getTransactionCount",
          params: ["0x0", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getTransactionCount",
      },
      {
        requestBody: {
          method: "eth_getUncleByBlockNumberAndIndex",
          params: ["0x0", "0x1"],
          id: 1,
        },
        requestMethod: "eth_getUncleByBlockNumberAndIndex",
      },
      {
        requestBody: {
          method: "eth_getUncleCountByBlockNumber",
          params: ["0x0"],
          id: 1,
        },
        requestMethod: "eth_getUncleCountByBlockNumber",
      },
    ];

    //
    // assert
    //

    for (const it of cases) {
      expect(getBlockHeightParam(it)).not.toBe("latest");
      expect(
        getBlockHeightParam({
          ...it,
          requestBody: setBlockHeightParam(it, "latest"),
        }),
      ).toBe("latest");
    }
  });
});
