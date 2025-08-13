import { pack, unpack } from "./core.pack.js";
import { ComposedWire, Wire } from "./core.wire.js";

export type SyncHead = {
  /**
   * NTP-inspired timestamps used to calculate offset between client and
   * Direct.dev infrastructure time.
   */
  clock:
    | {
        t2: Date;
        t3: Date;
      }
    | null
    | undefined;

  /**
   * currently known block height, so client can prime internal state
   */
  blockHeight: RPCBlockHeight | null | undefined;

  /**
   * pending block height (if any), to allow client to auto-propagate pending
   * block height at the correct time.
   */
  pendingBlockHeight:
    | {
        blockHeight: RPCBlockHeight;
        propagatesAt: Date;
      }
    | null
    | undefined;

  /**
   * primer information, to allow bringing freshly subscribed clients
   * up-to-date quickly.
   */
  primer:
    | {
        /**
         * dump of well-known set of request hashes that are synced ahead of
         * time.
         */
        syncSet: DirectRequestHash[];

        /**
         * dump of well-known set of request hashes which are auto-revalidated
         * ahead of time.
         */
        revalidateSet: DirectRequestHash[];

        /**
         * mapping of request hash --> response hash, which enables syncing of
         * persisted local state in the client with latest state in Direct.dev.
         */
        requestToResponseMap: Array<{
          requestHash: DirectRequestHash;
          responseHash: DirectResponseHash;
          expiresAt: Date;
        }>;
      }
    | null
    | undefined;
};

const blockHeight = new Wire<RPCBlockHeight>({
  encode: (input) => pack.str(input),
  decode: (input, cursor) => unpack.str(input, cursor) as [RPCBlockHeight, number],
});

const clock = new Wire<NonNullable<SyncHead["clock"]>>({
  encode: (input) => pack.date(input.t2) + pack.date(input.t3),
  decode: (input, cursor) => {
    const t2 = unpack.date(input, cursor);
    const t3 = unpack.date(input, t2[1]);

    return [
      {
        t2: t2[0],
        t3: t3[0],
      },
      t3[1],
    ];
  },
});

const pendingBlockHeight = new Wire<NonNullable<SyncHead["pendingBlockHeight"]>>({
  encode: (input) => pack.str(input.blockHeight) + pack.date(input.propagatesAt),
  decode: (input, cursor) => {
    const blockHeight = unpack.str(input, cursor);
    const propagatesAt = unpack.date(input, blockHeight[1]);

    return [
      {
        blockHeight: blockHeight[0] as RPCBlockHeight,
        propagatesAt: propagatesAt[0],
      },
      propagatesAt[1],
    ];
  },
});

const primer = new Wire<NonNullable<SyncHead["primer"]>>({
  encode: (input) =>
    pack.arr(input.syncSet, (item) => pack.sha256(item)) +
    pack.arr(input.revalidateSet, (item) => pack.sha256(item)) +
    pack.arr(
      input.requestToResponseMap,
      (item) => pack.sha256(item.requestHash) + pack.sha256(item.responseHash) + pack.date(item.expiresAt),
    ),
  decode: (input, cursor) => {
    const syncSet = unpack.arr(input, cursor, (cursor) => unpack.sha256(input, cursor));
    const revalidateSet = unpack.arr(input, syncSet[1], (cursor) => unpack.sha256(input, cursor));
    const requestToResponseMap = unpack.arr(input, revalidateSet[1], (cursor) => {
      const requestHash = unpack.sha256(input, cursor);
      const responseHash = unpack.sha256(input, requestHash[1]);
      const expiresAt = unpack.date(input, responseHash[1]);

      return [
        {
          requestHash: requestHash[0] as DirectRequestHash,
          responseHash: responseHash[0] as DirectResponseHash,
          expiresAt: expiresAt[0],
        },
        expiresAt[1],
      ];
    });

    return [
      {
        syncSet: syncSet[0] as DirectRequestHash[],
        revalidateSet: revalidateSet[0] as DirectRequestHash[],
        requestToResponseMap: requestToResponseMap[0],
      },
      requestToResponseMap[1],
    ];
  },
});

/**
 * effecient packer for head delivered when initializing state syncing.
 */
export const syncHead = new ComposedWire<SyncHead>({
  clock,
  blockHeight,
  pendingBlockHeight,
  primer,
});
