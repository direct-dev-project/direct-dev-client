import type { HashSetChecksum, HashSetDelta } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";

import { wire } from "./index.js";

/**
 * triggered periodically by Direct.dev infrastructure, re-enforcing that
 * client state is still valid to prevent drifting in case of dropped messages.
 */
export type PingSyncEvent = {
  event: "ping";
  data: {
    blockHeight: RPCBlockHeight;
    expiresAt: Date;
  };
};

/**
 * triggered by Direct.dev infrastructure when a new block height is observed,
 * allowing client to auto-update state at propagation time.
 */
export type BlockHeightSyncEvent = {
  event: "block-height.change";
  data: {
    blockHeight: RPCBlockHeight;
    propagatesAt: Date;
  };
};

/**
 * triggered by Direct.dev infrastructure if the currently pending block height
 * should be promoted ahead of time.
 */
export type BlockHeightPromoteEvent = {
  event: "block-height.promote";
  data: {
    blockHeight: RPCBlockHeight;
  };
};

/**
 * emits deltas in the list of cached and auto-revalidated requests handled by
 * Direct.dev infrastructure.
 */
export type CacheDeltaSyncEvent = {
  event: "cache.delta";
  data: {
    syncSet: HashSetDelta<DirectRequestHash>;
    revalidateSet: HashSetDelta<DirectRequestHash>;
  };
};

/**
 * emits operations required to perform automatic continuation of current
 * clientside cache layer to latest remote state.
 */
export type CacheContinuationSyncEvent = {
  event: "cache.continuation";
  data: {
    /**
     * checksum of the continuation, used to allow the client to perform
     * validation of a continuation before committing it to memory
     */
    checksum: HashStr;

    /**
     * collection of requests that can be propagated to latest block height
     * with no changes since last continuation event.
     */
    unchanged: Array<{ requestIndex: number; expiresAt: Date }>;

    /**
     * collection of requests to perform dynamic patching of, against the last
     * known version since last continuation event.
     */
    patches: Array<{ requestIndex: number; patchStr: string; expiresAt: Date }>;

    /**
     * collection of full replacements needed to ensure full syncing of local
     * client cache.
     */
    replacements: Array<{
      requestIndex: number;
      response: DirectRPCResultResponse;
      expiresAt: Date;
      __preEncodedResponse?: string;
    }>;
  };
};

export type SyncEventStructure =
  | BlockHeightSyncEvent
  | BlockHeightPromoteEvent
  | CacheDeltaSyncEvent
  | CacheContinuationSyncEvent
  | PingSyncEvent;

/**
 * implementation of Wire packer for messages sent from Direct.dev
 * infrastructure down to clients to auto-synchronize state.
 */
export const syncEvent = new Wire<SyncEventStructure>(
  {
    ping: {
      id: 1,
      encode: (input) =>
        pack.str((input as PingSyncEvent).data.blockHeight) + pack.date((input as PingSyncEvent).data.expiresAt),
      decode: (input, cursor) => {
        const blockHeight = unpack.str(input, cursor);
        const expiresAt = unpack.date(input, blockHeight[1]);

        return [
          {
            event: "ping",
            data: {
              blockHeight: blockHeight[0] as RPCBlockHeight,
              expiresAt: expiresAt[0],
            },
          },
          expiresAt[1],
        ];
      },
    },

    "block-height.change": {
      id: 2,
      encode: (input) =>
        pack.str((input as BlockHeightSyncEvent).data.blockHeight) +
        pack.date((input as BlockHeightSyncEvent).data.propagatesAt),
      decode: (input, cursor) => {
        const blockHeight = unpack.str(input, cursor);
        const propagatesAt = unpack.date(input, blockHeight[1]);

        return [
          {
            event: "block-height.change",
            data: {
              blockHeight: blockHeight[0] as RPCBlockHeight,
              propagatesAt: propagatesAt[0],
            },
          },
          propagatesAt[1],
        ];
      },
    },

    "block-height.promote": {
      id: 3,
      encode: (input) => pack.str((input as BlockHeightPromoteEvent).data.blockHeight),
      decode: (input, cursor) => {
        const blockHeight = unpack.str(input, cursor);

        return [
          {
            event: "block-height.promote",
            data: {
              blockHeight: blockHeight[0] as RPCBlockHeight,
            },
          },
          blockHeight[1],
        ];
      },
    },

    "cache.delta": {
      id: 4,
      encode: (input) =>
        requestHashSetDelta.encode((input as CacheDeltaSyncEvent).data.syncSet) +
        requestHashSetDelta.encode((input as CacheDeltaSyncEvent).data.revalidateSet),
      decode: (input, cursor) => {
        const syncSet = requestHashSetDelta.decode(input, cursor);
        const revalidateSet = requestHashSetDelta.decode(input, syncSet[1]);

        return [
          {
            event: "cache.delta",
            data: {
              syncSet: syncSet[0],
              revalidateSet: revalidateSet[0],
            },
          },
          revalidateSet[1],
        ];
      },
    },

    "cache.continuation": {
      id: 5,
      encode: (input) =>
        pack.hash((input as CacheContinuationSyncEvent).data.checksum) +
        pack.arr(
          (input as CacheContinuationSyncEvent).data.unchanged,
          (item) => pack.int(item.requestIndex) + pack.date(item.expiresAt),
        ) +
        pack.arr(
          (input as CacheContinuationSyncEvent).data.patches,
          (item) => pack.int(item.requestIndex) + pack.date(item.expiresAt) + pack.str(item.patchStr),
        ) +
        pack.arr(
          (input as CacheContinuationSyncEvent).data.replacements,
          (item) =>
            pack.int(item.requestIndex) +
            pack.date(item.expiresAt) +
            wire.RPCResponse.encode(item.response, { requestMethod: null, preEncoded: item.__preEncodedResponse }),
        ),
      decode: (input, cursor) => {
        const checksum = unpack.hash(input, cursor);

        const unchanged = unpack.arr(input, checksum[1], (cursor) => {
          const requestIndex = unpack.int(input, cursor);
          const expiresAt = unpack.date(input, requestIndex[1]);

          return [
            {
              requestIndex: requestIndex[0],
              expiresAt: expiresAt[0],
            },
            expiresAt[1],
          ];
        });

        const patches = unpack.arr(input, unchanged[1], (cursor) => {
          const requestIndex = unpack.int(input, cursor);
          const expiresAt = unpack.date(input, requestIndex[1]);
          const patchStr = unpack.str(input, expiresAt[1]);

          return [
            {
              requestIndex: requestIndex[0],
              expiresAt: expiresAt[0],
              patchStr: patchStr[0],
            },
            patchStr[1],
          ];
        });

        const replacements = unpack.arr(input, patches[1], (cursor) => {
          const requestIndex = unpack.int(input, cursor);
          const expiresAt = unpack.date(input, requestIndex[1]);
          const response = wire.RPCResponse.decode(input, expiresAt[1]);

          return [
            {
              requestIndex: requestIndex[0],
              expiresAt: expiresAt[0],
              response: response[0] as DirectRPCResultResponse,
            },
            response[1],
          ];
        });

        return [
          {
            event: "cache.continuation",
            data: {
              checksum: checksum[0],
              unchanged: unchanged[0],
              patches: patches[0],
              replacements: replacements[0],
            },
          },
          replacements[1],
        ];
      },
    },
  },
  (input) => input.event,
);

/**
 * encodes a delta to allow bring a set of request hashes up-to-date by only
 * transferring changes between the two sets.
 */
export const requestHashSetDelta = new Wire<HashSetDelta<DirectRequestHash>>({
  encode: (input) =>
    pack.hash(input.checksum) +
    pack.arr(input.added, (it) => pack.hash(it)) +
    pack.arr(input.removed, (it) => pack.hash(it)),
  decode: (input, cursor) => {
    const checksum = unpack.hash(input, cursor);
    const added = unpack.arr(input, checksum[1], (cursor) => unpack.hash(input, cursor));
    const removed = unpack.arr(input, added[1], (cursor) => unpack.hash(input, cursor));

    return [
      {
        checksum: checksum[0] as HashSetChecksum,
        added: added[0] as DirectRequestHash[],
        removed: removed[0] as DirectRequestHash[],
      },
      removed[1],
    ];
  },
});
