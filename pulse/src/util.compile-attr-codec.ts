import { check, checkpoint } from "@direct.dev/checkpoint";

import type { MetricAttributesFromSchema, MetricAttributesSchema } from "./typings.js";

/**
 * Branded subtype of string, used to recognize serialized metrics for
 * correctness of integration of instruments.
 */
export type SerializedMetricAttributes = string & { readonly __brand: unique symbol };

export type AttributeCodec<TAttrs extends MetricAttributesSchema> = {
  serialize: (attrs: MetricAttributesFromSchema<TAttrs>) => SerializedMetricAttributes;
  deserialize: (input: SerializedMetricAttributes) => MetricAttributesFromSchema<TAttrs>;
};

/**
 * Compile the serialize / deserialize pair for attributes based on the
 * provided schema, optimized for runtime performance.
 */
export function compileAttrCodec<TAttrs extends MetricAttributesSchema>(
  instrumentName: string,
  attrSchema: TAttrs,
): AttributeCodec<TAttrs> {
  const schema = checkpoint(`PulseInstrument(${instrumentName})`, check.shape(attrSchema));

  return {
    serialize(input) {
      return schema.encode(input) as SerializedMetricAttributes;
    },

    deserialize(input) {
      return schema.decode(input, 0)[0] as MetricAttributesFromSchema<TAttrs>;
    },
  };
}
