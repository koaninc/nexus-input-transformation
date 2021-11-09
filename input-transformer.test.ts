import { ApolloServerBase as ApolloServer } from "apollo-server-core";
import {
  core,
  makeSchema,
  queryField,
  nonNull,
  objectType,
  inputObjectType,
  plugin,
  dynamicInputMethod,
} from "nexus";

import { InputTransformer } from "./input-transformer";
import { TypeConstructor } from "./types";

declare global {
  // eslint-disable-next-line no-unused-vars
  interface NexusGenCustomInputMethods<TypeName extends string> {
    expectInput<FieldName extends string>(
      fieldName: FieldName,
      opts?: (
        | core.CommonInputFieldConfig<TypeName, FieldName>
        | core.NexusInputFieldConfig<TypeName, FieldName>
      ) & {
        typeConstructor: keyof core.InputDefinitionBlock<any>;
        to: any;
      }
    ): void;
  }
}

function buildExpectPlugin() {
  const inputTransformer = new InputTransformer(
    "expectPlugin",
    (options) => ({ typeConstructor: options.typeConstructor, to: options.to }),
    (_input, config) => {
      return config.to;
    }
  );

  return plugin({
    name: "Expect InputTransform Plugin",
    description: "Reports that an argument has been transformed as expected",
    onInstall(builder) {
      builder.addType(
        dynamicInputMethod({
          name: "expectInput",
          factory({ typeDef, args }) {
            const [fieldName, fieldConfig] = args as [
              string,
              Readonly<Record<string, any>>
            ];

            const {
              typeConstructor,
              to,
              type = undefined,
              ...rest
            } = fieldConfig;

            typeDef[typeConstructor as TypeConstructor](fieldName, {
              ...rest,
              type,
              extensions: {
                expectPlugin: {
                  to,
                },
              },
            });
          },
        })
      );
    },

    onCreateFieldResolver(config) {
      const { args: argTypes } = config.fieldConfig;
      if (!argTypes) {
        return;
      }

      const transform = inputTransformer.buildResolverMiddleware(argTypes);

      if (!transform) {
        return;
      }

      return function (root, args, ctx, info, next) {
        return next(root, transform(args), ctx, info);
      };
    },
  });
}

function buildServer(types: Record<string, core.NexusExtendTypeDef<string>>) {
  const schema = makeSchema({
    plugins: [buildExpectPlugin()],
    types,
  });

  return new ApolloServer({
    schema,
  });
}

describe("Feature: Transformation of input arguments", () => {
  describe("Senario: A query with a mixed set of args including arguments to be transformed", () => {
    const query = queryField("getOutput", {
      type: objectType({
        name: "Output",
        definition(t) {
          t.nonNull.string("id");
          t.nonNull.int("int");
          t.nonNull.boolean("boolean");
          t.nonNull.string("expected1");
          t.nonNull.string("expected2");
          t.nonNull.list.nonNull.string("expectedList");
          t.nonNull.field("nested", {
            type: objectType({
              name: "NestedOutput",
              definition(t) {
                t.nonNull.string("foo");
                t.nonNull.string("bar");
                t.nonNull.string("baz");
              },
            }),
          });
        },
      }),
      args: {
        input: nonNull(
          inputObjectType({
            name: "Input",
            definition(t) {
              t.nonNull.string("id");
              t.nonNull.int("int");
              t.nonNull.boolean("boolean");
              t.nonNull.expectInput("expected1", {
                typeConstructor: "string",
                to: "TRANSFORMED 1",
              });
              t.nonNull.expectInput("expected2", {
                typeConstructor: "string",
                to: "TRANSFORMED 2",
              });
              t.nonNull.list.nonNull.expectInput("expectedList", {
                typeConstructor: "string",
                to: "TRANSFORMED LIST",
              });
              t.nonNull.expectInput("nested", {
                typeConstructor: "field",
                type: inputObjectType({
                  name: "NestedInput",
                  definition(t) {
                    t.nonNull.string("foo");
                    t.nonNull.string("bar");
                    t.nonNull.string("baz");
                  },
                }),
                to: {
                  foo: "this",
                  bar: "is",
                  baz: "TRANSFORMED",
                },
              });
            },
          })
        ),
      },

      resolve(_, { input }) {
        return input;
      },
    });

    it("should transform the transformable arguments, leaving the others alone", async () => {
      const server = buildServer({ query });

      const result = await server.executeOperation({
        query: `query{
                  getOutput(
                    input: {
                      id: "id",
                      int: 2,
                      boolean: true,
                      expected1: "hello",
                      expected2: "world",
                      expectedList: [ "Oh", "my", "goodness", "me"]
                      nested: {
                        foo: "Hello",
                        bar: "World!",
                        baz: "It's me!",
                      }
                    }
                  ) {
                    id,
                    int,
                    boolean,
                    expected1,
                    expected2,
                    expectedList,
                    nested {
                      foo
                      bar
                      baz
                    }
                  }
                }`,
      });

      expectGraphQLCompletedSuccessfully(result);
      expect(result.data.getOutput.id).toBe("id");
      expect(result.data.getOutput.int).toBe(2);
      expect(result.data.getOutput.boolean).toBe(true);
      expect(result.data.getOutput.expected1).toBe("TRANSFORMED 1");
      expect(result.data.getOutput.expected2).toBe("TRANSFORMED 2");
      expect(result.data.getOutput.expectedList).toEqual([
        "TRANSFORMED LIST",
        "TRANSFORMED LIST",
        "TRANSFORMED LIST",
        "TRANSFORMED LIST",
      ]);
      expect(result.data.getOutput.nested).toEqual({
        foo: "this",
        bar: "is",
        baz: "TRANSFORMED",
      });
    });
  });
});

function expectGraphQLCompletedSuccessfully(result: any): asserts result is {
  data: Record<string, any>;
} {
  expect(result.errors).toBeUndefined();
  expect(result.data).toBeDefined();
}
