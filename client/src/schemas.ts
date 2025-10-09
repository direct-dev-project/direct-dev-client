import { checkpoint, check } from "@direct.dev/checkpoint";
import type { HashSetChecksum } from "@direct.dev/shared";
import type { wire } from "@direct.dev/wire";

import type { DirectRPCClientConfig } from "./_direct-rpc-client.js";
import type { PersistedSyncState } from "./core.sync.js";
import type { PersistedTelemetry } from "./core.telemetry.js";

/**
 * schema for validating provided configurations when instantiating clients
 */
export const configSchema = checkpoint<DirectRPCClientConfig>(
  "config",
  check.shape({
    projectId: check.str,
    projectToken: check.optional(check.str),
    networkId: check.literal(
      "ethereum-holesky",
      "ethereum-sepolia",
      "ethereum",
      "sonic-blaze-testnet",
      "sonic-testnet",
      "sonic",
    ),
    failover: check.optional(check.arr(check.str, { minLength: 1 })),
    baseUrl: check.optional(check.str),
    preferredFormat: check.optional(check.literal("wire", "ndjson", "jsonrpc")),
    logLevel: check.optional(check.literal("verbose", "debug", "info", "warn", "error")),
    batchWindowMs: check.optional(check.num),
    devMode: check.optional(check.bool),
    disableSync: check.optional(check.bool),
    networkInspect: check.optional(check.bool),
  }),
);

/**
 * schema for validating untrusted JSON-RPC request objects
 */
export const rpcRequestSchema = checkpoint<DirectRPCRequest & { jsonrpc: string }>(
  "rpcRequest",
  check.shape({
    id: check.strOrNum,
    method: check.str,
    jsonrpc: check.str,
    params: check.optional(check.unknown),
  }),
);

const rpcResultResponse = check.shape({
  id: check.strOrNum,
  result: check.unknown,
  expiresAt: check.optional(check.date),
});

const rpcErrorResponse = check.shape({
  id: check.strOrNum,
  error: check.shape({
    code: check.num,
    message: check.str,
    data: check.optional(check.unknown),
  }),
});

/**
 * schema for validating untrusted JSON-RPC response objects
 */
export const rpcResponseSchema = checkpoint<DirectRPCResultResponse | DirectRPCErrorResponse>(
  "rpcResponse",
  check.union(rpcResultResponse, rpcErrorResponse),
);

/**
 * schema for validating the head segment on Direct.dev WireStreams for JSON-RPC
 * requests
 */
export const rpcHeadSchema = checkpoint<DirectRPCHead>(
  "rpcHead",
  check.shape({
    blockHeight: check.optional(check.typedStr<RPCBlockHeight>()),
    blockHeightExpiresAt: check.optional(check.date),
  }),
);

/**
 * schema for validating the head segment on Direct.dev WireStreams for Direct
 * Sync lines.
 */
export const syncHeadSchema = checkpoint<wire.SyncHead>(
  "syncHead",
  check.shape({
    blockHeight: check.optional(check.typedStr<RPCBlockHeight>()),
    clock: check.optional(
      check.shape({
        t2: check.date,
        t3: check.date,
      }),
    ),
    pendingBlockHeight: check.optional(
      check.shape({
        blockHeight: check.typedStr<RPCBlockHeight>(),
        propagatesAt: check.date,
      }),
    ),
    primer: check.optional(
      check.shape({
        syncSet: check.arr(check.typedHash<DirectRequestHash>()),
        revalidateSet: check.arr(check.typedHash<DirectRequestHash>()),
        requestToResponseMap: check.arr(
          check.shape({
            requestHash: check.typedHash<DirectRequestHash>(),
            responseHash: check.typedHash<DirectResponseHash>(),
            expiresAt: check.date,
          }),
        ),
      }),
    ),
  }),
);

/**
 * schema for validating the tail segment on Direct.dev WireStreams for Direct
 * Sync lines, containing synchronization events.
 */
export const syncEventSchema = checkpoint<wire.SyncEventStructure>(
  "syncEvent",
  check.union(
    check.shape({
      event: check.literal("ping"),
      data: check.shape({
        blockHeight: check.typedStr<RPCBlockHeight>(),
        expiresAt: check.date,
      }),
    }),
    check.shape({
      event: check.literal("block-height.change"),
      data: check.shape({
        blockHeight: check.typedStr<RPCBlockHeight>(),
        propagatesAt: check.date,
      }),
    }),
    check.shape({
      event: check.literal("block-height.promote"),
      data: check.shape({
        blockHeight: check.typedStr<RPCBlockHeight>(),
      }),
    }),
    check.shape({
      event: check.literal("cache.delta"),
      data: check.shape({
        syncSet: check.shape({
          checksum: check.typedHash<HashSetChecksum>(),
          added: check.arr(check.typedHash<DirectRequestHash>()),
          removed: check.arr(check.typedHash<DirectRequestHash>()),
        }),
        revalidateSet: check.shape({
          checksum: check.typedHash<HashSetChecksum>(),
          added: check.arr(check.typedHash<DirectRequestHash>()),
          removed: check.arr(check.typedHash<DirectRequestHash>()),
        }),
      }),
    }),
    check.shape({
      event: check.literal("cache.continuation"),
      data: check.shape({
        checksum: check.typedHash<HashSetChecksum>(),
        unchanged: check.arr(
          check.shape({
            requestIndex: check.num,
            expiresAt: check.date,
          }),
        ),
        patches: check.arr(
          check.shape({
            requestIndex: check.num,
            patchStr: check.str,
            expiresAt: check.date,
          }),
        ),
        replacements: check.arr(
          check.shape({
            requestIndex: check.num,
            response: rpcResultResponse,
            expiresAt: check.date,
          }),
        ),
      }),
    }),
  ),
);

/**
 * schema for validating telemetry data persisted within local storage on the
 * client.
 */
export const persistedTelemetrySchema = checkpoint<PersistedTelemetry>(
  "persistedTelemetry",
  check.shape({
    backoffEvents: check.arr(
      check.shape({
        source: check.literal("direct-rpc", "direct-sync", "failover"),
        contextId: check.str,
        failureCount: check.num,
        registerredAt: check.date,
        durationMs: check.num,
      }),
    ),
  }),
);

/**
 * schema for validating state syncing persisted within session storage on the
 * client across page loads.
 */
export const persistedSyncStateSchema = checkpoint<PersistedSyncState>(
  "persistedSyncState",
  check.shape({
    hashSet: check.shape({
      items: check.arr(check.typedHash<DirectRequestHash>()),
      checksum: check.typedHash<HashSetChecksum>(),
    }),
  }),
);
