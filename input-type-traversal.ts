import {
  isWrappingType,
  isType,
  isInputObjectType,
  GraphQLInputObjectType,
  GraphQLArgumentConfig,
  GraphQLNamedType,
  GraphQLInputType,
  GraphQLInputField,
} from "graphql";

import { core } from "nexus";

export type ArgDef = GraphQLArgumentConfig;
export type ArgType = GraphQLInputType | GraphQLInputField | GraphQLNamedType;

export type Node =
  | ArgDef
  | ArgType
  | Record<string, ArgDef>
  | Record<string, ArgType>;

type NodeCtx<T> = {
  key?: string;
  wrapping: core.NexusWrapKind[];
  initialNodeValue: T;
};

type Reducer<T> = (
  childValues: T | Record<string, T>,
  currentNode: Node,
  ctx: NodeCtx<T>
) => T;

/**
 * `reduceOverArgDefs<T>` performs a post-order reduction over a nexus argument
 * definition tree `Record<string, GraphQLArgumentConfig>`
 *
 * At each iteration, the reducer is provided three values:
 *
 * * `childValues` - only populated when visiting an input object node, at
 *                   non-object nodes this is undefined
 *
 * * `currentNode` - the current node of the iteration
 *
 * * `ctx` - context about the current node, such as its key in its parent node
 *           and any wrapping types like 'List' or 'NonNull'
 *
 * Because argument definitions may have several layers of wrapping or
 * indirection before getting to data the reducer can work with (i.e. a type
 * definition's `extensions` field), the given reducer can choose to return
 * `undefined` to signal that no valid value could be produced and to continue
 * to the next layer of wrapping at the same depth of the argument tree.
 *
 * @typeParam T - the return value of the given reducer
 *
 * @param reducer - a function that produces values at each node of the argument
 *                  definition tree.
 * @param argDefs - the root of the argument definition tree
 * @param initialNodevalue - an initial value to provide for each node
 *
 * @returns the final result of the reduction T
 */
export function reduceOverArgDefs<T>(
  reducer: Reducer<T>,
  argDefs: Record<string, ArgDef>,
  initialNodeValue: T
): T {
  const childEntries = Object.entries(argDefs)
    .map(([key, argDef]: [string, ArgDef]): [string, T] => {
      return [
        key,
        reduceOverArgDef(
          argDef,
          { key, wrapping: [], initialNodeValue },
          reducer
        ),
      ];
    })
    .filter(([_, v]) => v !== undefined);

  return reducer(Object.fromEntries(childEntries), argDefs, {
    wrapping: [],
    initialNodeValue,
  });
}

function reduceOverArgDef<T>(
  argDef: ArgDef,
  ctx: NodeCtx<T>,
  reducer: Reducer<T>
): T {
  const nextValue = reducer(ctx.initialNodeValue, argDef, ctx);

  if (nextValue !== undefined) {
    return nextValue;
  }

  return reduceOverArgType(argDef.type, ctx, reducer);
}

function reduceOverArgType<T>(
  argType: ArgType,
  ctx: NodeCtx<T>,
  reducer: Reducer<T>
): T {
  const { namedType, wrapping } = unwrapType(argType);

  const nextValue = reducer(ctx.initialNodeValue, argType, {
    ...ctx,
    wrapping,
  });

  if (nextValue !== undefined) {
    return nextValue;
  }

  return reduceOverWrappedType(namedType, { ...ctx, wrapping }, reducer);
}

function reduceOverWrappedType<T>(
  argType: ArgType,
  ctx: NodeCtx<T>,
  reducer: Reducer<T>
): T {
  const nextValue = reducer(ctx.initialNodeValue, argType, ctx);

  if (nextValue !== undefined) {
    return nextValue;
  }

  if (isInputObjectType(argType)) {
    return reduceOverObjectType(argType, ctx, reducer);
  }

  return undefined;
}

function reduceOverObjectType<T>(
  argType: GraphQLInputObjectType,
  ctx: NodeCtx<T>,
  reducer: Reducer<T>
): T {
  const childValues: [string, T][] = Object.entries(argType.getFields())
    .map(([key, argType]: [string, ArgType]): [string, T] => {
      return [
        key,
        reduceOverArgType(
          argType,
          {
            key,
            wrapping: [],
            initialNodeValue: ctx.initialNodeValue,
          },
          reducer
        ),
      ];
    })
    .filter(([_, v]) => v !== undefined);

  return reducer(Object.fromEntries(childValues), argType, ctx);
}

function unwrapType(type: ArgType): {
  namedType: ArgType;
  wrapping: core.NexusWrapKind[];
} {
  if (!isType(type)) {
    return unwrapType(type.type);
  }

  if (core.isNexusWrappingType(type)) {
    const { namedType, wrapping } = core.unwrapNexusDef(type);

    return {
      // we cast to ArgType here because core.unwrapNexusDef returns a big union
      // of all input AND output types, and we know we're only dealing with
      // input types here
      namedType: typeof namedType === "string" ? type : (namedType as ArgType),
      wrapping,
    };
  }

  if (isWrappingType(type)) {
    return core.unwrapGraphQLDef(type);
  }

  return {
    namedType: type,
    wrapping: [],
  };
}
