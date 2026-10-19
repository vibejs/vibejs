import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import { isRoute, type Route, type RouteDef } from '@vibejs-org/contract';
import { vibeError } from './errors.gen.ts';

export interface OpenApiOptions {
  info: { title: string; version: string; description?: string };
  servers?: readonly { url: string; description?: string }[];
  /** Forwarded as `~standard.jsonSchema.input|output({ target: 'draft-2020-12', libraryOptions })`. */
  libraryOptions?: Record<string, unknown>;
  /** Used when a schema has no converter or its converter throws. */
  toJsonSchema?: (schema: StandardSchemaV1, io: 'input' | 'output') => Record<string, unknown>;
}

export interface OpenApiDocument {
  openapi: '3.1.1';
  info: OpenApiOptions['info'];
  servers?: { url: string; description?: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

type Json = Record<string, unknown>;
type Part = 'params' | 'query' | 'headers' | 'body' | 'response';

const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null;

// Deep copies of JSON data with each `#/$defs/X` reference pointed at `components.schemas`.
const rewrite = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(rewrite) : isJson(value) ? rewriteRefs(value) : value;
const rewriteRefs = (json: Json): Json =>
  Object.fromEntries(
    Object.entries(json).map(([key, value]) => [
      key,
      key === '$ref' && typeof value === 'string'
        ? value.replace(/^#\/\$defs\//, '#/components/schemas/')
        : rewrite(value),
    ]),
  );

/** The JSON Schema of `schema`: its own converter first, then `toJsonSchema`, else VIBE9801. */
function toJson(
  schema: StandardSchemaV1,
  io: 'input' | 'output',
  { libraryOptions, toJsonSchema }: OpenApiOptions,
  route: string,
  part: Part,
): Json {
  const { jsonSchema }: Partial<StandardJSONSchemaV1.Props> = schema['~standard'];
  const attempts = [
    jsonSchema && (() => jsonSchema[io]({ target: 'draft-2020-12', libraryOptions })),
    toJsonSchema && (() => toJsonSchema(schema, io)),
  ];
  let reason = 'the schema has no Standard JSON Schema converter';
  let cause: unknown;
  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      return attempt();
    } catch (error) {
      cause = error;
      reason = error instanceof Error ? error.message : String(error);
    }
  }
  throw vibeError('VIBE9801', { route, part, reason }, { cause });
}

const problem = (status: number, codes: string[]): Json => ({
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer', const: status },
    code: { type: 'string', enum: codes },
    detail: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          in: { type: 'string', enum: ['params', 'query', 'headers', 'body'] },
          pointer: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['in', 'pointer', 'message'],
      },
    },
    requestId: { type: 'string' },
  },
  required: ['type', 'title', 'status', 'code'],
});

/**
 * An OpenAPI 3.1 document of every route in `contracts`: a contract, a record of contracts or
 * nested records (the `createClient` shape). Schemas are converted with their Standard JSON
 * Schema converter; their named definitions are shared in `components.schemas`. Throws VIBE9801
 * for a schema that cannot be converted and VIBE9802 for two different schemas with one name.
 *
 * @example Serve the document with a middleware:
 * ```ts
 * const doc = generateOpenApi({ users }, { info: { title: 'API', version: '1.0.0' }, servers: [{ url: '/api' }] });
 * const openapi: Middleware = (req, next) =>
 *   new URL(req.url).pathname === '/openapi.json' ? Promise.resolve(Response.json(doc)) : next();
 * ```
 */
export function generateOpenApi(contracts: object, options: OpenApiOptions): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  // A Map, so that names such as `constructor` or `__proto__` are plain keys.
  const schemas = new Map<string, unknown>();

  const convert = (schema: StandardSchemaV1, io: 'input' | 'output', route: string, part: Part) => {
    const json = toJson(schema, io, options, route, part);
    // `#` points at the root schema, which is not a component; in the document it is the document.
    if (JSON.stringify(json).includes('"$ref":"#"'))
      throw vibeError('VIBE9801', {
        route,
        part,
        reason:
          'the schema refers to itself with `$ref: "#"`; give it a name, such as zod `.meta({ id })`',
      });
    const { $schema: _, $defs, ...rest } = json;
    for (const [name, def] of Object.entries(isJson($defs) ? $defs : {})) {
      const value = rewrite(def);
      // Converters emit keys in a fixed order, so equal schemas serialize equally.
      if (schemas.has(name) && JSON.stringify(schemas.get(name)) !== JSON.stringify(value))
        throw vibeError('VIBE9802', { name, route });
      schemas.set(name, value);
    }
    return rewriteRefs(rest);
  };

  const operation = (route: Route, keys: string[]) => {
    // A def whose path has params, so that `params` is typed; it comes from a route builder.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
    const def = route.def as RouteDef<`:${string}`>;
    const label = `${route.method} ${route.path}`;
    const input = (part: 'params' | 'query' | 'headers', schema: StandardSchemaV1) => {
      const json = convert(schema, 'input', label, part);
      const properties = isJson(json.properties) ? json.properties : {};
      const required: unknown[] = Array.isArray(json.required) ? json.required : [];
      return { properties, required };
    };

    const params = def.params && input('params', def.params).properties;
    const parameters: Json[] = route.path
      .split('/')
      .filter((segment) => segment.startsWith(':'))
      .map((segment) => ({
        name: segment.slice(1),
        in: 'path',
        required: true,
        schema: params?.[segment.slice(1)] ?? { type: 'string' },
      }));
    for (const part of ['query', 'headers'] as const) {
      const schema = def[part];
      if (!schema) continue;
      const { properties, required } = input(part, schema);
      for (const [name, value] of Object.entries(properties))
        parameters.push({
          name,
          in: part === 'query' ? 'query' : 'header',
          required: required.includes(name),
          schema: value,
        });
    }
    const body = def.body && convert(def.body, 'input', label, 'body');

    const responses: Json = {};
    const status = String(def.status ?? 200);
    if (!def.response) responses['204'] = { description: 'No Content' };
    else if ('~standard' in def.response) {
      const schema = convert(def.response, 'output', label, 'response');
      responses[status] = { description: 'OK', content: { 'application/json': { schema } } };
    } else responses[status] = { description: 'OK', content: { [def.response.contentType]: {} } };

    const hasInput = Boolean(def.params ?? def.query ?? def.headers ?? def.body);
    const errors = { ...(hasInput && { VALIDATION_FAILED: 400 }), ...def.errors };
    const groups: Record<number, string[]> = {};
    for (const [code, at] of Object.entries(errors)) (groups[at] ??= []).push(code);
    for (const [at, codes] of Object.entries(groups))
      responses[at] = {
        description: codes.join(', '),
        content: { 'application/problem+json': { schema: problem(Number(at), codes) } },
      };

    return {
      operationId: keys.join('.'),
      ...(keys.length > 1 && { tags: [keys[0]] }),
      ...(def.summary !== undefined && { summary: def.summary }),
      ...(def.description !== undefined && { description: def.description }),
      ...(parameters.length > 0 && { parameters }),
      ...(body && {
        requestBody: { required: true, content: { 'application/json': { schema: body } } },
      }),
      responses,
    };
  };

  const walk = (node: object, keys: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      const at = [...keys, key];
      if (isRoute(value)) {
        const path = value.path.replaceAll(/:(\w+)/g, '{$1}');
        (paths[path] ??= {})[value.method.toLowerCase()] = operation(value, at);
      } else if (isJson(value)) walk(value, at);
    }
  };
  walk(contracts, []);

  return {
    openapi: '3.1.1',
    info: { ...options.info },
    ...(options.servers && { servers: options.servers.map((server) => ({ ...server })) }),
    paths,
    components: { schemas: Object.fromEntries(schemas) },
  };
}
