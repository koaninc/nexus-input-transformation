import { isListType } from "graphql";
import { reduceOverArgDefs, ArgDef, Node } from "./input-type-traversal";

export type Transform<
  Config extends Record<string, any>,
  Input,
  Output = Input
> = (input: Input, config: Config) => Output;

export type InputTransform<Input = any, Output = Input> = (
  arg: Input
) => Output;

type KeyTransformer<Input = any, Output = Input> = [
  string,
  InputTransform<Input, Output>
];

export type ConfigExtractor<Config extends Record<string, any>> = (
  options: Readonly<Record<string, any>>
) => Config;

/**
 * `InputTransformer` will traverse over a Nexus-build-time argument definition
 * record, i.e. a `Record<string, GraphQLArgumentConfig>` and compose a given
 * transform over the tree of inputs to produce an `InputTransform` function
 * that can be applied as part of a resolver middleware
 *
 * @typeParam Config - An extension of `Record<string, any>` that will be passed to the transform
 * @typeParam Input - The input type of the transform
 * @typeParam Output - The return type of the transform, defaults to `Input`
 *
 * @param extensionName - The unique key to store the `Config` values under
 * @param transform - a function that takes a `Config` and `Input` and returns an `Output`
 *
 * @returns a function that will transform all input arguments whose definitions
 * have valid `Config` values, or undefined if no such function can be build
 */
export class InputTransformer<
  Config extends Record<string, any>,
  Input,
  Output = Input
> {
  // eslint-disable-next-line no-useless-constructor
  constructor(
    private readonly extensionName: string,
    public readonly extractConfig: ConfigExtractor<Config>,
    private readonly transform: Transform<Config, Input, Output>
  ) {}

  /**
   * Builds a function by composing `this.transform` over the tree of argument
   * definitions, applying it to any value that had valid extensions
   *
   * @param argDefs - the argument definitions from a nexus type's field config
   *
   * ```ts
   * const inputTransformer = new InputTransformer(<snip>);
   * plugin({
   *   // ...
   *   onCreateFieldResolver(config) {
   *     const transform = inputTransformer.buildResolverMiddleware(config.fieldConfig.args);
   *     // ...
   *   }
   * })
   * ```
   */
  public buildResolverMiddleware(
    argDefs: Record<string, ArgDef>
  ): InputTransform<Record<string, any>> | undefined {
    return reduceOverArgDefs<InputTransform<Record<string, any>> | undefined>(
      (childValues, currentNode, ctx) => {
        const childEntries = Object.entries(childValues ?? {});

        if (childEntries.length > 0) {
          return this.composeKeyTransformers(childEntries);
        }

        const extensions = this.getExtensions(currentNode);

        if (!extensions) {
          return undefined;
        }

        if (ctx.wrapping.includes("List")) {
          return this.makeListTransform(extensions);
        }

        return this.makeTransform(extensions);
      },
      argDefs,
      null
    );
  }

  private composeKeyTransformers(
    keyTransformers: KeyTransformer[]
  ): InputTransform<Record<string, any>> {
    return (args: Record<string, any>) => {
      return keyTransformers.reduce(
        (carry, [key, transform]) => ({
          ...carry,
          [key]: transform(carry[key]),
        }),
        args
      );
    };
  }

  private makeTransform(config: Config): InputTransform<Input, Output> {
    return (input: Input) => this.transform(input, config);
  }

  private makeListTransform(config: Config): InputTransform<Input[], Output[]> {
    const transform = this.makeTransform(config);
    return (input: Input[]) => input.map(transform);
  }

  private getExtensions(node: Node): Config | undefined {
    if (!this.hasExtensions(node)) {
      return undefined;
    }

    return node.extensions[this.extensionName];
  }

  private hasExtensions(
    node: Node
  ): node is Node & { extensions: Readonly<Record<string, any>> } {
    return !isListType(node) && (node as any).extensions !== undefined;
  }
}
