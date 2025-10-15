import { checkpoint } from "@direct.dev/checkpoint";

import type { MetricAttributesFromSchema, MetricAttributesSchema } from "./typings.js";

/**
 * Branded subtype of string, used to recognize serialized metrics for
 * correctness of integration of instruments.
 */
export type SerializedMetricAttributes = string & { readonly __brand: unique symbol };

export type AttributeCodec<TLabels extends string[] | null, TAttrs extends MetricAttributesSchema | null> = {
  serialize: (
    label: TLabels extends string[] ? TLabels[number] : null,
    attrs: TAttrs extends MetricAttributesSchema ? MetricAttributesFromSchema<TAttrs> : null,
  ) => SerializedMetricAttributes;
  deserialize: (input: SerializedMetricAttributes) => Record<string, unknown> | undefined;
};

/**
 * Compile the serialize / deserialize pair for attributes based on the
 * provided schema, optimized for runtime performance.
 */
export function compileAttrCodec<
  const TLabels extends string[] | null,
  const TAttrs extends MetricAttributesSchema | null,
>(instrumentName: string, labels: TLabels, _attrSchema: TAttrs): AttributeCodec<TLabels, TAttrs> {
  const hasLabels = labels != null;
  const hasAttributes = _attrSchema != null && _attrSchema.keys.length > 0;

  // if empty label + attribute set was given, return a noop codec which is
  // blazingly fast at runtime
  if (!hasLabels && !hasAttributes) {
    return {
      serialize() {
        return "" as SerializedMetricAttributes;
      },
      deserialize() {
        return undefined;
      },
    };
  }

  // if ONLY labels were given, then encode simply using preset and return
  // without re-allocating variables
  if (!hasAttributes) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const labelSchema = parseLabels(labels!);

    return {
      serialize(label) {
        return label as SerializedMetricAttributes;
      },
      deserialize(input) {
        return labelSchema[input];
      },
    };
  }

  // ... otherwise pre-compile a full schema
  const attrSchema = checkpoint(`PulseInstrument(${instrumentName})`, _attrSchema);

  // if ONLY attributes were given, then we can simply encode/decode using the
  // built-ins from Checkpoint+Wire
  if (!hasLabels) {
    return {
      serialize(label, attrs) {
        return attrSchema.encode(attrs) as SerializedMetricAttributes;
      },
      deserialize(input) {
        return attrSchema.decode(input)[0];
      },
    };
  }

  // finally, if BOTH labels and attributes were given, then we need to merge
  // both attributes and static preset labels
  //
  // to achieve this, encode using Checkpoint+Wire to efficiently encode
  // dynamic attributes and append label key, and decode using Checkpoint+Wire
  // to extract dynamic attributes and then build a merged attribute object
  // using label key --> label set as a base
  const keys = _attrSchema.keys;
  const keysLen = keys.length;

  const labelEntries = new Map(labels.map((label) => [label, parseLabelEntries(label)] as const));

  return {
    serialize(label, attrs) {
      return (attrSchema.encode(attrs) + label) as SerializedMetricAttributes;
    },
    deserialize(input) {
      // extract attributes and label
      const [attrs, labelCursor] = attrSchema.decode(input);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const labelAttrs = labelEntries.get(input.slice(labelCursor))!;

      // build merged attribute output, using label key set as base, and adding
      // dynamic attributes
      const rec = Object.create(null);

      for (let i = 0, j = labelAttrs.length; i < j; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [key, value] = labelAttrs[i]!;
        rec[key] = value;
      }

      for (let i = 0; i < keysLen; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const key = keys[i]!;
        rec[key] = attrs[key];
      }

      return rec;
    },
  };
}

/**
 * Parses an array of static label sets, and transforms it into a pre-computed
 * lookup map of label --> record
 */
function parseLabels<TLabels extends string[]>(labels: TLabels): Record<string, Record<string, string>> {
  const len = labels.length;
  const res = Object.create(null);

  for (let i = 0; i < len; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const label = labels[i]!;
    res[label] = parseLabel(label);
  }

  return res;
}

/**
 * Parses a single label string, and transforms it into a record with all
 * extracted key/value pairs:
 *
 * @example key:value foo:bar // --> { key: "value", foo: "bar" }
 */
function parseLabel(label: string): Record<string, string> {
  const tokens = label.trim().split(/\s+/).filter(Boolean);
  const res = Object.create(null);

  for (let i = 0, j = tokens.length; i < j; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const segments = tokens[i]!.split(":");

    if (segments.length !== 2) {
      throw new Error(
        `compileAttrCodec.parseLabel(): invalid segment count, exactly two must be given: '${tokens[i]}'`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const key = segments[0]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const value = segments[1]!;

    if (key.length === 0) {
      throw new Error(
        `compileAttrCodec.parseLabel(): invalid segment key, must be at least 1 character long: '${tokens[i]}'`,
      );
    }

    if (value.length === 0) {
      throw new Error(
        `compileAttrCodec.parseLabel(): invalid segment value, must be at least 1 character long: '${tokens[i]}'`,
      );
    }

    res[key] = value;
  }

  return res;
}

/**
 * Parses a single label string, and transforms it into a record with all
 * extracted key/value pairs:
 *
 * @example key:value foo:bar // --> { key: "value", foo: "bar" }
 */
function parseLabelEntries(label: string): Array<[string, string]> {
  const tokens = label.trim().split(/\s+/).filter(Boolean);
  const tokenLen = tokens.length;
  const res = new Array<[string, string]>(tokenLen);

  for (let i = 0; i < tokenLen; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const segments = tokens[i]!.split(":");

    if (segments.length !== 2) {
      throw new Error(
        `compileAttrCodec.parseLabelEntries(): invalid segment count, exactly two must be given: '${tokens[i]}'`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const key = segments[0]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const value = segments[1]!;

    if (key.length === 0) {
      throw new Error(
        `compileAttrCodec.parseLabelEntries(): invalid segment key, must be at least 1 character long: '${tokens[i]}'`,
      );
    }

    if (value.length === 0) {
      throw new Error(
        `compileAttrCodec.parseLabelEntries(): invalid segment value, must be at least 1 character long: '${tokens[i]}'`,
      );
    }

    res[i] = [key, value];
  }

  return res;
}
