import type { DirectRPCRequest } from "@direct.dev/shared";

import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";
import { RPCRequest } from "./structures.rpc-request.js";

export type ClientReportEntry = DirectRPCRequest & {
  timestamp: Date;
  blockHeight: string | undefined;
  __encodedStr?: string;
};

export type ClientReport = {
  cacheHits: ClientReportEntry[];
  prefetchHits: ClientReportEntry[];
  inflightHits: ClientReportEntry[];
};

/**
 * Wire encoder optimized to pack metrics regarding cache hits and request
 * samples collected in the client layer.
 */
export const clientReport = new Wire<ClientReport>({
  encode: (input) =>
    pack.arr(input.cacheHits, (it) => clientReportEntryWire.encode(it)) +
    pack.arr(input.prefetchHits, (it) => clientReportEntryWire.encode(it)) +
    pack.arr(input.inflightHits, (it) => clientReportEntryWire.encode(it)),
  decode: (input, cursor) => {
    const cacheHits = unpack.arr(input, cursor, (cursor) => clientReportEntryWire.decode(input, cursor));
    const prefetchHits = unpack.arr(input, cacheHits[1], (cursor) => clientReportEntryWire.decode(input, cursor));
    const inflightHits = unpack.arr(input, prefetchHits[1], (cursor) => clientReportEntryWire.decode(input, cursor));

    return [
      {
        cacheHits: cacheHits[0],
        prefetchHits: prefetchHits[0],
        inflightHits: inflightHits[0],
      },
      inflightHits[1],
    ];
  },
});

const clientReportEntryWire = new Wire<ClientReportEntry>({
  encode: (input) =>
    (input.__encodedStr ?? RPCRequest.encode(input)) + pack.date(input.timestamp) + pack.nullableStr(input.blockHeight),
  decode: (input, cursor) => {
    const request = RPCRequest.decode(input, cursor);
    const timestamp = unpack.date(input, request[1]);
    const blockHeight = unpack.nullableStr(input, timestamp[1]);

    return [
      {
        ...request[0],
        timestamp: timestamp[0],
        blockHeight: blockHeight[0] ?? undefined,
        __encodedStr: input.slice(cursor, request[1]),
      },
      blockHeight[1],
    ];
  },
});
