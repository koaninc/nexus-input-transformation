# Nexus Input Transformation

## Purpose

Because GraphQL input types don't have backing types or resolvers, it can be
difficult to automate repetitive transformations on query and mutation
arguments.

This library gives you the tools to do so, using the `InputTransformer` class to
create resolver middleware for every query and mutation that uses your custom Input type.

It also provides a plugin generator that will do the heavy lifting for 80% of
plugins that just want to apply a simple transform.

## How it works

At nexus schema build time (initiatiated by Nexus' `makeSchema`, for example),
an `InputTransformer` can be used to crawl over the nexus type definitions of a
resolver's arguments, and return a function that can be applied to that
resolver's arguments as a middleware, like so:

```typescript
plugin({
  // ...
  onCreateFieldResolver(config) {
    const { args: argTypes } = config.fieldConfig;
    const transform = inputTransformer.buildResolverMiddleware(argTypes);

    if (!transform) {
      return;
    }

    return function (root, args, ctx, info, next) {
      return next(root, transform(args), ctx, info);
    };
  },
});
```

This library also exports a plugin generating helper that will allow you to just
pass in a few options and a transform and get back a plugin that will apply that
transform. See `examples/opaque-id-plugin.ts` for an example.

## Future improvements

Currently, all resolvers have their input argument trees traversed to determine
whether they have any fields that need to be transformed _by each plugin_ using
`InputTransformer.

In the presence of many such plugins or deep input types, this behavior could
lead to some performance issues bringing up your GraphQL API.

In the future we hope to be able to enable tagging/tracking the types of queries
and mutations that require input transformation, to prevent the pathological
need to scan each type multiple times.
