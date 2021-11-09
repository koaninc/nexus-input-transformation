import { ApolloServerBase as ApolloServer } from "apollo-server-core";
import {
  core,
  makeSchema,
  queryField,
  stringArg,
  intArg,
  booleanArg,
  nonNull,
  objectType,
  inputObjectType,
} from "nexus";

import {
  getOpaqueIDPlugin,
  opaqueIDArg,
  InputOpaqueIDFieldConfig,
} from "./opaque-id-plugin";

declare global {
  // eslint-disable-next-line no-unused-vars
  interface NexusGenCustomInputMethods<TypeName extends string> {
    opaqueID<FieldName extends string>(
      fieldName: FieldName,
      opts?: core.CommonInputFieldConfig<TypeName, FieldName> &
        InputOpaqueIDFieldConfig
    ): void;
  }
}

function encode(input: string) {
  return Buffer.from(input, "utf8").toString("base64");
}

function buildServer(types: Record<string, core.NexusExtendTypeDef<string>>) {
  const schema = makeSchema({
    plugins: [getOpaqueIDPlugin()],
    types: types,
  });

  return new ApolloServer({
    schema: schema,
  });
}

describe("Feature: Auto-decoding and deprefixing of input types", () => {
  describe("Scenario: A query with a mixed set of args including opaqueIDArgs", () => {
    const id1 = "this-is-sum-fake-id";
    const id2 = "this-is-sum-fake-id-2";
    const int = 1;
    const bool = false;
    const nonIdString = "bloobity";
    const prefix1 = "INPUT1ARG";
    const prefix2 = "INPUT2ARG";

    const query = queryField("getOutput", {
      type: objectType({
        name: "Output",
        definition(t) {
          t.nonNull.string("id1");
          t.nonNull.string("id2");
          t.nonNull.int("int");
          t.nonNull.boolean("boolean");
          t.string("nullable");
          t.nonNull.string("nonIdString");
        },
      }),
      args: {
        id1: nonNull(opaqueIDArg({ prefix: prefix1, cleanPrefix: true })),
        id2: nonNull(opaqueIDArg({ prefix: prefix2, cleanPrefix: false })),
        int: nonNull(intArg()),
        boolean: nonNull(booleanArg()),
        nullable: stringArg(),
        nonIdString: nonNull(stringArg()),
      },

      resolve(_root, args) {
        return args;
      },
    });

    let result: any;
    beforeAll(async () => {
      const server = buildServer({ query });

      result = await server.executeOperation({
        query: `query {
                  getOutput(
                    id1: "${encode(prefix1 + "-" + id1)}",
                    id2: "${encode(prefix2 + "-" + id2)}",
                    int: ${int},
                    boolean: ${bool},
                    nonIdString: "${nonIdString}"
                  ) {
                    id1
                    id2
                    int
                    boolean
                    nullable
                    nonIdString
                  }
                }`,
      });
    });

    it("should have resolved successfully", () => {
      expect(result.errors).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it("should have decoded and deprefixed the first input", () => {
      expect(result.data.getOutput.id1).toBe(id1);
    });

    it("should have decoded but left prefixed the second input", () => {
      expect(result.data.getOutput.id2).toBe(`${prefix2}-${id2}`);
    });

    it("should have left the args untouched", () => {
      expect(result.data.getOutput.int).toBe(int);
      expect(result.data.getOutput.boolean).toBe(bool);
      expect(result.data.getOutput.nullable).toBe(null);
      expect(result.data.getOutput.nonIdString).toBe(nonIdString);
    });
  });

  describe("Scenario: Mixed use input objects with opaqueIDs and opaqueIDArgs", () => {
    const id1 = "this-is-sum-fake-id";
    const prefix1 = "INPUT1ARG";

    const id2 = "this-is-sum-fake-id-2";
    const prefix2 = "INPUT2ARG";

    const nonIdString = "bloobity";

    const listIds = [
      "this-should-end-up-unprefixed-1",
      "this-should-end-up-unprefixed-2",
      "this-should-end-up-unprefixed-3",
      "this-should-end-up-unprefixed-4",
    ];

    const query = queryField("getOutput", {
      type: objectType({
        name: "Output",
        definition(t) {
          t.nonNull.string("id1");
          t.nonNull.string("id2");
          t.nonNull.string("nonIdString");
          t.nonNull.field("idBox", {
            type: objectType({
              name: "IdBox",
              definition(t) {
                t.string("nullableId");
                t.nonNull.list.nonNull.string("listIds");
              },
            }),
          });
        },
      }),
      args: {
        id1: nonNull(opaqueIDArg({ prefix: prefix1, cleanPrefix: true })),
        id2: nonNull(opaqueIDArg({ prefix: prefix2, cleanPrefix: false })),
        nonIdString: nonNull(stringArg()),
        idBox: nonNull(
          inputObjectType({
            name: "IDBoxInput",
            definition(t) {
              t.opaqueID("nullableId", { prefix: "NULLABLE" });
              t.nonNull.list.nonNull.opaqueID("listIds", {
                prefix: "LIST",
                cleanPrefix: true,
              });
            },
          })
        ),
      },

      resolve(_root, args) {
        return args;
      },
    });

    let result: any;
    beforeAll(async () => {
      const server = buildServer({ query });

      result = await server.executeOperation({
        query: `query {
                  getOutput(
                    id1: "${encode(prefix1 + "-" + id1)}",
                    id2: "${encode(prefix2 + "-" + id2)}",
                    nonIdString: "${nonIdString}"
                    idBox: {
                      nullableId: null,
                      listIds: ${JSON.stringify(
                        listIds.map((id) => encode("LIST" + "-" + id))
                      )}
                    }
                  ) {
                    id1
                    id2
                    nonIdString
                    idBox {
                      nullableId,
                      listIds
                    }
                  }
                }`,
      });
    });

    it("should have resolved successfully", () => {
      expect(result.errors).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it("should have decoded and deprefixed the first input", () => {
      expect(result.data.getOutput.id1).toBe(id1);
    });

    it("should have decoded but left prefixed the second input", () => {
      expect(result.data.getOutput.id2).toBe(`${prefix2}-${id2}`);
    });

    it("should have decoded the idBox arg", () => {
      expect(result.data.getOutput.idBox.nullableId).toBe(null);
      expect(new Set(result.data.getOutput.idBox.listIds)).toEqual(
        new Set(listIds)
      );
    });

    it("should have left the other args untouched", () => {
      expect(result.data.getOutput.nonIdString).toBe(nonIdString);
    });
  });
});
