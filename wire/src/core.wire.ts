import { pack, unpack } from "./core.pack.js";
import { sha256 } from "./hashing.sha256.js";
import { sortObject } from "./hashing.sort-object.js";

type PackerId = string;

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
  /**
   * the collection of packers available within this instance, allowing
   * blazingly fast encoding/decoding of these content structures
   */
  #packers: WirePackerCollection<T, TExtraEncodeArgs>;

  /**
   * the length of structure IDs, used to quickly infer type of well-known
   * structures while decoding.
   */
  #idLength: number;

  /**
   * utility method provided when instantiating the Wire, which determines
   * which packer to employ based on the structure of the input.
   */
  #encodeMapper: (input: T, extraArgs: TExtraEncodeArgs) => string | undefined;

  /**
   * pre-compiled map of PackerId --> structure key, so that we can perform
   * blazingly fast decoding by mapping an input string to the correct decoder
   * by simply inspecting the first two bytes and comparing it to well-known
   * PackerIds
   */
  #decodeMap = new Map<PackerId, string>();

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
      this.#packers = {
        packer: {
          id: "",
          ...(packers as Omit<WirePacker<T, TExtraEncodeArgs>, "id">),
        },
      };

      this.#encodeMapper = () => "packer";
    } else {
      this.#packers = packers as WirePackerCollection<T, TExtraEncodeArgs>;
      this.#encodeMapper = mapper;
    }

    let idLength: number | undefined;

    Object.entries(this.#packers).forEach(([key, { id }]) => {
      if (id.charAt(0) === "@") {
        throw new Error(`new Wire(): structure IDs must not start with @ (${id})`);
      }

      if (idLength === undefined) {
        idLength = id.length;
      } else if (id.length !== idLength) {
        throw new Error(
          `new Wire(): all structure IDs must have exact same length (${id} doesn't match expected length of ${idLength})`,
        );
      }
      if (this.#decodeMap.has(id)) {
        throw new Error(
          `new Wire(): multiple structures cannot own the same structure ID '${id}' (${key} + ${this.#decodeMap.get(id)})`,
        );
      }

      this.#decodeMap.set(id, key);
    });

    this.#idLength = idLength ?? 0;
  }

  /**
   * encode the provided input using one of the available packers if possible,
   * otherwise falling back to using JSON.stringify for graceful fallback
   * handling of unknown structures.
   */
  encode(input: T, ...extraArgs: TExtraEncodeArgs): string {
    const packerKey = this.#encodeMapper(input, extraArgs);
    if (packerKey === undefined) return JSON.stringify(input);

    const packer = this.#packers[packerKey];
    return packer ? packer.id + packer.encode(input, extraArgs) : "@" + pack.str(JSON.stringify(input));
  }

  /**
   * utility to perform consistent hashing of input requests, utilizing the
   * blazingly fast Wire encoding protocol to generate the hashing input.
   *
   * @param encodedStr - if the input was decoded from an encoded string, then
   *        it's possible to supply the original encoded string here and reuse
   *        that for maximum hashing performance
   */
  hash(input: T, encodedStr?: string, ...extraArgs: TExtraEncodeArgs): Promise<string> {
    const packerKey = this.#encodeMapper(input, extraArgs);
    if (packerKey === undefined) return sha256(sortObject(input));

    const packer = this.#packers[packerKey];
    return sha256(packer ? (encodedStr ?? packer.id + packer.encode(input, extraArgs)) : sortObject(input));
  }

  /**
   * decode the provided string using one of the available packers if possible,
   * otherwise falling back to using JSON.parse for graceful fallback handling
   * of unknown structures.
   */
  decode(input: string, cursor = 0): [T, number] {
    const idEnd = cursor + this.#idLength;
    const packerId = input.slice(cursor, idEnd) as PackerId;
    const packerKey = this.#decodeMap.get(packerId);

    if (!packerKey) {
      const str = unpack.str(input, cursor + 1);
      return [JSON.parse(str[0]), str[1]];
    }

    const packer = this.#packers[packerKey];
    if (!packer) {
      const str = unpack.str(input, cursor + 1);
      return [JSON.parse(str[0]), str[1]];
    }

    return packer.decode(input, idEnd);
  }
}
