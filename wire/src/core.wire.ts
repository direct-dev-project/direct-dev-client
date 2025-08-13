import { pack, unpack } from "./core.pack.js";

type PackerId = number;

/**
 * A packer is a set of encoder/decoder methods, which should be implemented in
 * a blazingly fast manner to allow faster encoding/decoding for well-known
 * structures compared to native JSON.stringify/parse.
 *
 * Encoders should generally employ a template string interpolation pattern for
 * maximum performance, possibly with usage of other nested WirePacker
 * integrations for maximum performance. Decoders should do minimal string
 * processing and attempt to create objects in a single pass (e.g. extracting
 * all properties first, and then creating the output object rather than
 * creating a bare object and adding properties as we go).
 *
 * @note Type inferrence in decoders is intentionally not strong, it is up to
 *       authors to ensure input/output correctness. We strongly encourage
 *       writing unit tests for Wire implementations to help verify
 *       implementations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WirePacker<T, TExtraEncodeArgs extends any[]> = {
  id: PackerId;
  encode: (input: T, extraArgs: TExtraEncodeArgs) => string;
  decode: (input: string, cursor: number) => [T, number];
};

/**
 * A collection of optimized packers, which are provided to Wire instances to
 * allow custom made, optimized encoder/decoder pairs for specific use cases
 * (e.g. one instance for requests and another for responses).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WirePackerCollection<T, TExtraEncodeArgs extends any[]> = Record<string, WirePacker<T, TExtraEncodeArgs>>;

/**
 * Wire instances allows combining a collection of packers that are optimized
 * for specific use cases (e.g. ETH requests or responses) with tailor made
 * encoder/decoder pairs for relevant data structures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Wire<T, TExtraEncodeArgs extends any[] = []> {
  /**
   * utility method provided when instantiating the Wire, which determines
   * which packer to employ based on the structure of the input.
   */
  #encodeMapper: (input: T, extraArgs: TExtraEncodeArgs) => string | { preEncoded: string } | undefined;

  /**
   * pre-compiled map of packer key --> packer, so that we can perform very
   * fast lookup of encode functions.
   */
  #keyMap = new Map<string | undefined, WirePacker<T, TExtraEncodeArgs>>();

  /**
   * pre-compiled map of PackerId --> packer, so that we can perform very fast
   * lookup of decode functions based on the first character in the output.
   */
  #idMap = new Map<PackerId, WirePacker<NoInfer<T>, NoInfer<TExtraEncodeArgs>>>();

  /**
   * if a single packer is given when creating this class, then it is mapped
   * here and used exclusively to avoid overhead of encoding unnecessary
   * structure IDs
   */
  #singlePacker: WirePacker<T, TExtraEncodeArgs> | undefined;

  /**
   * initialize the instance by creating optimized lookups for decode/encoders
   */
  constructor(packer: Omit<WirePacker<NoInfer<T>, NoInfer<TExtraEncodeArgs>>, "id">);
  constructor(
    packers: WirePackerCollection<NoInfer<T>, NoInfer<TExtraEncodeArgs>>,
    mapper: (input: NoInfer<T>, extraArgs: TExtraEncodeArgs) => string | { preEncoded: string } | undefined,
  );
  constructor(
    packers:
      | Omit<WirePacker<NoInfer<T>, NoInfer<TExtraEncodeArgs>>, "id">
      | WirePackerCollection<NoInfer<T>, NoInfer<TExtraEncodeArgs>>,
    mapper?: (input: NoInfer<T>, extraArgs: TExtraEncodeArgs) => string | { preEncoded: string } | undefined,
  ) {
    if (mapper === undefined) {
      this.#encodeMapper = () => undefined;
      this.#singlePacker = {
        id: 1,
        ...(packers as Omit<WirePacker<T, TExtraEncodeArgs>, "id">),
      };
    } else {
      this.#encodeMapper = mapper;

      Object.entries(packers).forEach(([key, packer]) => {
        if (packer.id <= 0) {
          throw new Error(`new Wire(): structure IDs must be greater than 0 (${packer.id})`);
        }

        if (this.#idMap.has(packer.id)) {
          throw new Error(`new Wire(): multiple structures cannot own the same structure ID '${packer.id}' (${key})`);
        }

        this.#keyMap.set(key, packer);
        this.#idMap.set(packer.id, packer);
      });
    }
  }

  /**
   * encode the provided input using one of the available packers if possible,
   * otherwise falling back to using JSON.stringify for graceful fallback
   * handling of unknown structures.
   */
  encode(input: T, ...extraArgs: TExtraEncodeArgs): string {
    if (this.#singlePacker !== undefined) {
      // if we're running in a single encoder/decoder setup, then avoid adding
      // structure ID to output
      return this.#singlePacker.encode(input, extraArgs);
    }

    const encodeData = this.#encodeMapper(input, extraArgs);

    if (encodeData && typeof encodeData === "object") {
      return encodeData.preEncoded;
    }

    const packer = this.#keyMap.get(encodeData);

    return packer
      ? String.fromCharCode(packer.id) + packer.encode(input, extraArgs)
      : String.fromCharCode(0) + pack.json(input);
  }

  /**
   * decode the provided string using one of the available packers if possible,
   * otherwise falling back to using JSON.parse for graceful fallback handling
   * of unknown structures.
   */
  decode(input: string, cursor = 0): [T, number] {
    if (this.#singlePacker !== undefined) {
      // if we're running in a single encoder/decoder setup, then run it from
      // the beginning of the input
      return this.#singlePacker.decode(input, cursor);
    }

    const packer = this.#idMap.get(input.charCodeAt(cursor));

    if (packer) {
      return packer.decode(input, cursor + 1);
    }

    try {
      return unpack.json(input, cursor + 1) as [T, number];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Wire.decode(): unable to decode input (${msg}):\n\n${JSON.stringify(input.slice(cursor + 1))}`);
    }
  }
}

/**
 * create a Wire that composes multiple sub-structures for a bigger object,
 * with each property on the composed wire being optional.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ComposedWire<T extends Record<string, unknown>, TExtraEncodeArgs extends any[] = []> extends Wire<
  T,
  TExtraEncodeArgs
> {
  constructor(wires: {
    [K in keyof T]: Wire<NonNullable<T[K]>>;
  }) {
    super(makePackers<T, TExtraEncodeArgs>(wires), makeMapper(wires));
  }
}

/**
 * create WirePackerCollection for all of the composed wires, automatically
 * creating a packer for every available combination of composed wires using
 * bitmasking.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePackers<T extends Record<string, unknown>, TExtraEncodeArgs extends any[] = []>(input: {
  [K in keyof T]: Wire<NonNullable<T[K]>>;
}): WirePackerCollection<T, TExtraEncodeArgs> {
  const wires = Object.entries(input) as Array<[keyof T, Wire<NonNullable<T[keyof T]>, TExtraEncodeArgs>]>;
  const packers: WirePackerCollection<T, TExtraEncodeArgs> = {};

  for (let id = 0, total = 1 << wires.length; id < total; id++) {
    packers[String(id + 1)] = {
      id: id + 1,
      encode: (input, extraArgs) => {
        return wires.reduce((acc, [key, wire], index) => {
          if (id & (1 << index)) {
            return acc + wire.encode(input[key] as NonNullable<T[keyof T]>, ...extraArgs);
          }

          return acc;
        }, "");
      },
      decode: (input, cursor) => {
        return wires.reduce(
          (acc, [key, wire], index) => {
            if (id & (1 << index)) {
              const [value, nextCursor] = wire.decode(input, acc[1]);

              acc[0][key] = value;
              acc[1] = nextCursor;
            }

            return acc;
          },
          [{} as T, cursor],
        );
      },
    };
  }

  return packers;
}

/**
 * create a mapper function, which scans an incoming object for present
 * properties and returns the correct ID based on applied bitmask.
 */
function makeMapper<T extends Record<string, unknown>>(input: {
  [K in keyof T]: Wire<NonNullable<T[K]>>;
}): (input: T) => string {
  const keys = Object.keys(input) as Array<keyof T>;

  return (input: T) => {
    const id = keys.reduce((acc, key, index) => {
      if (input[key] != null) {
        return acc | (1 << index);
      }

      return acc;
    }, 0);

    return (id + 1).toString();
  };
}
