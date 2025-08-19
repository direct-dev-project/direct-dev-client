import {
  arr,
  bool,
  checkpoint,
  date,
  literal,
  num,
  optional,
  shape,
  str,
  strOrNum,
  typedStr,
  union,
  unknown,
} from "@direct.dev/checkpoint";
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
  shape({
    projectId: str,
    projectToken: optional(str),
    networkId: literal("ethereum-holesky", "ethereum-sepolia", "ethereum", "sonic-testnet", "sonic"),
    failover: optional(arr(str, { minLength: 1 })),
    baseUrl: optional(str),
    preferredFormat: optional(literal("wire", "ndjson", "jsonrpc")),
    logLevel: optional(literal("verbose", "debug", "info", "warn", "error")),
    batchWindowMs: optional(num),
    devMode: optional(bool),
    disableSync: optional(bool),
    networkInspect: optional(bool),
  }),
);

/**
 * schema for validating untrusted JSON-RPC request objects
 */
export const rpcRequestSchema = checkpoint<DirectRPCRequest & { jsonrpc: string }>(
  "rpcRequest",
  shape({
    id: strOrNum,
    method: str,
    jsonrpc: str,
    params: optional(unknown),
  }),
);

const rpcResultResponse = shape({
  id: strOrNum,
  result: unknown,
  expiresAt: optional(date),
});

const rpcErrorResponse = shape({
  id: strOrNum,
  error: shape({
    code: num,
    message: str,
    data: optional(unknown),
  }),
});

/**
 * schema for validating untrusted JSON-RPC response objects
 */
export const rpcResponseSchema = checkpoint<DirectRPCResultResponse | DirectRPCErrorResponse>(
  "rpcResponse",
  union(rpcResultResponse, rpcErrorResponse),
);

/**
 * schema for validating the head segment on Direct.dev WireStreams for JSON-RPC
 * requests
 */
export const rpcHeadSchema = checkpoint<DirectRPCHead>(
  "rpcHead",
  shape({
    blockHeight: optional(typedStr<RPCBlockHeight>()),
    blockHeightExpiresAt: optional(date),
  }),
);

/**
 * schema for validating the head segment on Direct.dev WireStreams for Direct
 * Sync lines.
 */
export const syncHeadSchema = checkpoint<wire.SyncHead>(
  "syncHead",
  shape({
    blockHeight: optional(typedStr<RPCBlockHeight>()),
    clock: optional(
      shape({
        t2: date,
        t3: date,
      }),
    ),
    pendingBlockHeight: optional(
      shape({
        blockHeight: typedStr<RPCBlockHeight>(),
        propagatesAt: date,
      }),
    ),
    primer: optional(
      shape({
        syncSet: arr(typedStr<DirectRequestHash>()),
        revalidateSet: arr(typedStr<DirectRequestHash>()),
        requestToResponseMap: arr(
          shape({
            requestHash: typedStr<DirectRequestHash>(),
            responseHash: typedStr<DirectResponseHash>(),
            expiresAt: date,
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
  union(
    shape({
      event: literal("ping"),
      data: shape({
        blockHeight: typedStr<RPCBlockHeight>(),
        expiresAt: date,
      }),
    }),
    shape({
      event: literal("block-height.change"),
      data: shape({
        blockHeight: typedStr<RPCBlockHeight>(),
        propagatesAt: date,
      }),
    }),
    shape({
      event: literal("block-height.promote"),
      data: shape({
        blockHeight: typedStr<RPCBlockHeight>(),
      }),
    }),
    shape({
      event: literal("cache.delta"),
      data: shape({
        syncSet: shape({
          checksum: typedStr<HashSetChecksum>(),
          added: arr(typedStr<DirectRequestHash>()),
          removed: arr(typedStr<DirectRequestHash>()),
        }),
        revalidateSet: shape({
          checksum: typedStr<HashSetChecksum>(),
          added: arr(typedStr<DirectRequestHash>()),
          removed: arr(typedStr<DirectRequestHash>()),
        }),
      }),
    }),
    shape({
      event: literal("cache.continuation"),
      data: shape({
        checksum: typedStr<HashSetChecksum>(),
        unchanged: arr(
          shape({
            requestIndex: num,
            expiresAt: date,
          }),
        ),
        patches: arr(
          shape({
            requestIndex: num,
            patchStr: str,
            expiresAt: date,
          }),
        ),
        replacements: arr(
          shape({
            requestIndex: num,
            response: rpcResultResponse,
            expiresAt: date,
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
  shape({
    backoffEvents: arr(
      shape({
        source: literal("direct-rpc", "direct-sync", "failover"),
        contextId: str,
        failureCount: num,
        registerredAt: date,
        durationMs: num,
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
  shape({
    hashSet: shape({
      items: arr(typedStr<DirectRequestHash>()),
      checksum: typedStr<HashSetChecksum>(),
    }),
  }),
);
