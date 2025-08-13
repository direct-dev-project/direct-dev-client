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
        requestMethod: DirectRequestMethod;
      };
      blockHeight: RPCBlockHeightParam | undefined;
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
          requestMethod: "eth_call" as DirectRequestMethod,
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
          requestMethod: "eth_getBalance" as DirectRequestMethod,
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
          requestMethod: "eth_getBlockByNumber" as DirectRequestMethod,
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
          requestMethod: "eth_getBlockTransactionCountByNumber" as DirectRequestMethod,
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

          requestMethod: "eth_getCode" as DirectRequestMethod,
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
          requestMethod: "eth_getStorageAt" as DirectRequestMethod,
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
          requestMethod: "eth_getTransactionByBlockNumberAndIndex" as DirectRequestMethod,
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
          requestMethod: "eth_getTransactionCount" as DirectRequestMethod,
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
          requestMethod: "eth_getUncleByBlockNumberAndIndex" as DirectRequestMethod,
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
          requestMethod: "eth_getUncleCountByBlockNumber" as DirectRequestMethod,
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
          requestMethod: "eth_blockNumber" as DirectRequestMethod,
        },
        blockHeight: undefined,
      },
      {
        request: {
          requestBody: {
            method: "eth_chainId",
            params: [],
            id: 1,
          },
          requestMethod: "eth_chainId" as DirectRequestMethod,
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
          requestMethod: "eth_gasPrice" as DirectRequestMethod,
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
          requestMethod: "eth_getBlockByHash" as DirectRequestMethod,
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
          requestMethod: "eth_getBlockTransactionCountByHash" as DirectRequestMethod,
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
          requestMethod: "eth_getTransactionByBlockHashAndIndex" as DirectRequestMethod,
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
          requestMethod: "eth_getTransactionByHash" as DirectRequestMethod,
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
          requestMethod: "eth_getTransactionReceipt" as DirectRequestMethod,
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
          requestMethod: "eth_getUncleByBlockHashAndIndex" as DirectRequestMethod,
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
          requestMethod: "eth_getUncleCountByBlockHash" as DirectRequestMethod,
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
      requestMethod: DirectRequestMethod;
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
      requestMethod: "eth_call" as DirectRequestMethod,
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
      requestMethod: DirectRequestMethod;
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
        requestMethod: "eth_call" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getBalance",
          params: ["0x0", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getBalance" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getBlockByNumber",
          params: ["0x0", true],
          id: 1,
        },
        requestMethod: "eth_getBlockByNumber" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getBlockTransactionCountByNumber",
          params: ["0x0"],
          id: 1,
        },
        requestMethod: "eth_getBlockTransactionCountByNumber" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getCode",
          params: ["0x0", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getCode" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getStorageAt",
          params: ["0x0", "0x1", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getStorageAt" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getTransactionByBlockNumberAndIndex",
          params: ["0x0", "0x1"],
          id: 1,
        },
        requestMethod: "eth_getTransactionByBlockNumberAndIndex" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getTransactionCount",
          params: ["0x0", "0x0"],
          id: 1,
        },
        requestMethod: "eth_getTransactionCount" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getUncleByBlockNumberAndIndex",
          params: ["0x0", "0x1"],
          id: 1,
        },
        requestMethod: "eth_getUncleByBlockNumberAndIndex" as DirectRequestMethod,
      },
      {
        requestBody: {
          method: "eth_getUncleCountByBlockNumber",
          params: ["0x0"],
          id: 1,
        },
        requestMethod: "eth_getUncleCountByBlockNumber" as DirectRequestMethod,
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
