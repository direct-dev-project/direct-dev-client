import { pack, unpack } from "./core.pack.js";
import { sha256 } from "./hashing.sha256.js";
import { sortObject } from "./hashing.sort-object.js";

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
type WirePackerCollection<T, TExtraEncodeArgs extends any[]> = Record<string, WirePacker<T, TExtraEncodeArgs>>;

/**
 * Wire instances allows combining a collection of packers that are optimized
 * for specific use cases (e.g. ETH requests or responses) with tailor made
 * encoder/decoder pairs for relevant data structures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Wire<T, TExtraEncodeArgs extends any[] = []> {
  #packers: WirePackerCollection<T, TExtraEncodeArgs>;

  /**
   * utility method provided when instantiating the Wire, which determines
   * which packer to employ based on the structure of the input.
   */
  #encodeMapper: (input: T, extraArgs: TExtraEncodeArgs) => string | undefined;

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
    mapper: (input: NoInfer<T>, extraArgs: TExtraEncodeArgs) => string | undefined,
  );
  constructor(
    packers:
      | Omit<WirePacker<NoInfer<T>, NoInfer<TExtraEncodeArgs>>, "id">
      | WirePackerCollection<NoInfer<T>, NoInfer<TExtraEncodeArgs>>,
    mapper?: (input: NoInfer<T>, extraArgs: TExtraEncodeArgs) => string | undefined,
  ) {
    if (mapper === undefined) {
      this.#encodeMapper = () => undefined;
      this.#singlePacker = {
        id: 1,
        ...(packers as Omit<WirePacker<T, TExtraEncodeArgs>, "id">),
      };

      this.#packers = {
        singlePacker: this.#singlePacker,
      };
    } else {
      this.#packers = packers as WirePackerCollection<T, TExtraEncodeArgs>;
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

    const packer = this.#keyMap.get(this.#encodeMapper(input, extraArgs));

    return packer
      ? String.fromCharCode(packer.id) + packer.encode(input, extraArgs)
      : String.fromCharCode(0) + pack.json(input);
  }

  /**
   * utility to perform consistent hashing of input requests, utilizing the
   * blazingly fast Wire encoding protocol to generate the hashing input.
   *
   * @param encodedStr - if the input was decoded from an encoded string, then
   *        it's possible to supply the original encoded string here and reuse
   *        that for maximum hashing performance
   */
  async hash(input: T, encodedStr?: string, ...extraArgs: TExtraEncodeArgs): Promise<string> {
    const packer = this.#singlePacker ?? this.#keyMap.get(this.#encodeMapper(input, extraArgs));

    return sha256(
      packer
        ? (encodedStr ?? String.fromCharCode(packer.id) + packer.encode(input, extraArgs))
        : String.fromCharCode(0) + sortObject(input),
    );
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

    return packer ? packer.decode(input, cursor + 1) : (unpack.json(input, cursor + 1) as [T, number]);
  }

  /**
   * tiny utility to allow extending a Wire, adding extra capabilities to
   * built-in structures and/or adding new structures to the Wire.
   */
  __extend<T2 extends T>(
    packers: WirePackerCollection<NoInfer<T>, NoInfer<TExtraEncodeArgs>>,
    mapper?: (input: NoInfer<T | T2>, extraArgs: TExtraEncodeArgs) => string | undefined,
  ): Wire<T | T2, TExtraEncodeArgs> {
    return new Wire(
      {
        ...this.#packers,
        ...packers,
      },
      mapper
        ? (input, extraArgs) => mapper(input, extraArgs) ?? this.#encodeMapper(input, extraArgs)
        : this.#encodeMapper,
    );
  }
}
