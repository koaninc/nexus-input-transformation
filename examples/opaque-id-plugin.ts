/**
 * Defines a plugin to supply an `opaqueID` input type that will base64 decode and optionally
 * remove a prefix from its input
 *
 * ```ts
 * const GetOutput = queryField('getOutput, {
 *   // ...
 *   args: inputObjectType({
 *     name: 'Input',
 *     definition(t) {
 *       t.nonNull.opaqueID('id', { prefix: 'ID', cleanPrefix: true})
 *     }
 *   })
 * })
 * ```
 *
 * A query defined like the above would take a query like:
 * ```graphql
 * getOutput({ id: "SUQtMTIzNDU2"}) {
 *   // ... fields to select
 * }
 * ```
 *
 * And transform `id` into the value '123456' in the resolver
 */

import {
  buildArgConstructor,
  buildInputTransformerPlugin,
} from "../input-transformer-plugin";

export type InputOpaqueIDFieldConfig = {
  nullable?: boolean;
  prefix?: string;
  cleanPrefix?: boolean;
};

const CONFIG_TYPE_NAME = "InputOpaqueIDFieldConfig";

// This function takes the options supplied to the field configuration and
// extracts our custom configuration for our transformer
export function extractConfig(
  config: Readonly<Record<string, any>>
): InputOpaqueIDFieldConfig {
  const { prefix = "", cleanPrefix = false } = config;
  return {
    prefix,
    cleanPrefix,
  };
}

// The transform to apply to inputs before they are passed to the resolver.
export function transform(
  input: string | null,
  config: InputOpaqueIDFieldConfig
): string | null {
  if (!input) {
    return null;
  }

  const decoded = Buffer.from(input, "base64").toString("utf8");

  if (config.cleanPrefix) {
    return decoded.replace(new RegExp(String.raw`^${config.prefix}-`), "");
  }
  return decoded;
}

export function getOpaqueIDPlugin() {
  return buildInputTransformerPlugin<
    InputOpaqueIDFieldConfig,
    string | null,
    string | null
  >({
    // the name of the generated type
    name: "opaqueID",

    // the base type the plugin will use to represent our values
    typeConstructor: "id",

    // optional documentation for our input tyep
    description:
      "Adds an object type definition field to allow automatic decoding of opaque IDs",

    // these arguments interact with nexus' type generation so that we get the
    // benefits of typescript inside of resolvers
    fieldDefModule: __filename,
    fieldDefExports: [CONFIG_TYPE_NAME],
    configTypeString: CONFIG_TYPE_NAME,

    extractConfig,
    transform,
  });
}

/**
 * Creates an opaqueID argument, similar to `idArg`
 */
export const opaqueIDArg = buildArgConstructor<"ID", InputOpaqueIDFieldConfig>(
  "opaqueID",
  "ID",
  extractConfig
);
