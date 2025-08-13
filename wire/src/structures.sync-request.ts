import { pack, unpack } from "./core.pack.js";
import { Wire } from "./core.wire.js";
import { telemetry, type TelemetryStructure } from "./structures.telemetry.js";

export type SyncRequest = {
  /**
   * ID associated with the client session.
   */
  sessionId: string;

  /**
   * if given, then Direct.dev infrastructure should reply with a full state
   * snapshot initially, to allow the client to quickly synchronize initial
   * state.
   */
  primer:
    | {
        /**
         * contains a collection of already known responses in the client layer,
         * to avoid re-transmitting data that's already present at the client.
         */
        knownResponses: Set<DirectResponseHash>;
      }
    | undefined;

  /**
   * include telemetry for ingestion into agent
   */
  telemetry: TelemetryStructure | undefined;
};

/**
 * packs request body transmitted from client when establishing a new state
 * synchronization stream.
 *
 * @note that the request will automatically be prefixed with current Wire
 *       version, so Direct.dev infrastructure can perform automatic backwards
 *       compatibility with legacy versions without requiring client upgrades
 */
export const syncRequest = new Wire<SyncRequest>(
  {
    primer_telemetry: {
      id: 1,
      encode: (input) =>
        pack.str(input.sessionId) +
        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        pack.arr(Array.from(input.primer!.knownResponses), (item) => pack.sha256(item)) +
        telemetry.encode(input.telemetry!),
      /* eslint-enable @typescript-eslint/no-non-null-assertion */
      decode: (input, cursor) => {
        const sessionId = unpack.str(input, cursor);
        const knownResponses = unpack.arr(input, sessionId[1], (cursor) => unpack.sha256(input, cursor));
        const telemetryData = telemetry.decode(input, knownResponses[1]);

        return [
          {
            sessionId: sessionId[0],
            primer: {
              knownResponses: new Set(knownResponses[0] as DirectResponseHash[]),
            },
            telemetry: telemetryData[0],
          },
          telemetryData[1],
        ];
      },
    },

    primer: {
      id: 2,
      encode: (input) =>
        pack.str(input.sessionId) +
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        pack.arr(Array.from(input.primer!.knownResponses), (item) => pack.sha256(item)),
      decode: (input, cursor) => {
        const sessionId = unpack.str(input, cursor);
        const knownResponses = unpack.arr(input, sessionId[1], (cursor) => unpack.sha256(input, cursor));

        return [
          {
            sessionId: sessionId[0],
            primer: {
              knownResponses: new Set(knownResponses[0] as DirectResponseHash[]),
            },
            telemetry: undefined,
          },
          knownResponses[1],
        ];
      },
    },

    telemetry: {
      id: 3,
      encode: (input) =>
        pack.str(input.sessionId) +
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        telemetry.encode(input.telemetry!),
      decode: (input, cursor) => {
        const sessionId = unpack.str(input, cursor);
        const telemetryData = telemetry.decode(input, sessionId[1]);

        return [
          {
            sessionId: sessionId[0],
            primer: undefined,
            telemetry: telemetryData[0],
          },
          telemetryData[1],
        ];
      },
    },

    empty: {
      id: 4,
      encode: (input) => pack.str(input.sessionId),
      decode: (input, cursor) => {
        const sessionId = unpack.str(input, cursor);

        return [
          {
            sessionId: sessionId[0],
            primer: undefined,
            telemetry: undefined,
          },
          sessionId[1],
        ];
      },
    },
  },
  (input) => {
    if (input.primer != null && input.telemetry != null) {
      return "primer_telemetry";
    }

    if (input.primer != null) {
      return "primer";
    }

    if (input.telemetry != null) {
      return "telemetry";
    }

    return "empty";
  },
);
