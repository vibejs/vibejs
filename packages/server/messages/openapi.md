# OpenAPI

## VIBE9801: Unconvertible schema

> The {part} schema of {route} cannot be converted to JSON Schema: {reason}

`generateOpenApi()` converts each schema with its Standard JSON Schema converter (`~standard.jsonSchema`) and falls back to the `toJsonSchema` option. The schema has no converter, or the converter and the fallback both failed. The `cause` of this error is the error that was thrown.

### Fix

- Use a schema that JSON can represent, such as `z.iso.datetime()` instead of `z.date()`.
- Pass converter options through `libraryOptions`, such as the options that make the library emit a placeholder for unrepresentable types.
- Pass a `toJsonSchema(schema, io)` function that returns the JSON Schema for this schema.

## VIBE9802: Schema name collision

> Two different schemas are named {name}; the second one is used by {route}.

The named definitions (`$defs`) of every schema are moved to `components.schemas`, where one name holds one schema. Another route already used the name {name} for a schema that is not the same.

### Fix

- Give one of the two schemas another name.
- Reuse one schema object under the name {name} wherever the same shape is meant.
- A schema used in a request and in a response must convert to the same JSON Schema both ways; in zod, `z.strictObject()` does, while `z.object()` adds `additionalProperties: false` only to the response.
