import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
import type { BuiltinErrorCode, RouteDef, ValidationIssue } from '@vibejs-org/contract';
import { recordValue, type ProviderRecord } from '../di/injector.ts';
import { vibeError } from '../errors.gen.ts';
import type { RouteBinding } from '../module/graph.ts';
import { readJson } from './body.ts';
import type { CanActivate, ExceptionFilter, Interceptor, RequestContext } from './context.ts';
import { HttpError, isClientVisible, renderError } from './errors.ts';

// The server builds against the Node types, which have no global `BodyInit`.
type BodyInit = NonNullable<RequestInit['body']>;

/** The global enhancer records, built in the root module's scope. */
export interface GlobalEnhancers {
  readonly guards: readonly ProviderRecord[];
  readonly interceptors: readonly ProviderRecord[];
  readonly filters: readonly ProviderRecord[];
}

interface PipelineOptions {
  readonly basePath: string;
  readonly bodyLimit: number;
  readonly validateResponses: boolean;
}

const BUILTIN = new Set<string>([
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'INVALID_JSON',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'BODY_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] satisfies BuiltinErrorCode[]);

/** The RFC 6901 pointer of an issue path; no path is the root `''`. */
const pointer = (path: StandardSchemaV1.Issue['path'] = []): string =>
  path
    .map((segment) => {
      const key = String(typeof segment === 'object' ? segment.key : segment);
      return `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    })
    .join('');

/** The top-level keys that the schema's JSON Schema types as arrays; none without a converter. */
function arrayKeys(schema: StandardSchemaV1): ReadonlySet<string> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the converter is optional
  const { jsonSchema } = schema['~standard'] as Partial<StandardJSONSchemaV1.Props>;
  try {
    const json = jsonSchema?.input({ target: 'draft-2020-12' });
    const properties = Object.entries<unknown>(Object(json?.properties));
    return new Set(
      properties.filter(([, p]) => Reflect.get(Object(p), 'type') === 'array').map(([k]) => k),
    );
  } catch {
    return new Set();
  }
}

const isBodyInit = (value: unknown): value is BodyInit =>
  typeof value === 'string' ||
  value instanceof Blob ||
  value instanceof ArrayBuffer ||
  ArrayBuffer.isView(value) ||
  value instanceof ReadableStream ||
  value instanceof URLSearchParams ||
  value instanceof FormData;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- instantiate() built every record
const values = <T>(records: readonly ProviderRecord[]) => records.map((r) => recordValue(r) as T);

/**
 * The request handling of one route after routing: guards, interceptors, validation, the handler,
 * response building and the exception filters. Every error becomes a response.
 */
export function createPipeline(
  binding: RouteBinding,
  globals: GlobalEnhancers,
  options: PipelineOptions,
): (ctx: RequestContext) => Promise<Response> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every route def is a RouteDef
  const def = binding.route.def as RouteDef;
  const route = `${binding.route.method} ${options.basePath}${binding.route.path}`;
  const guards = values<CanActivate>([...globals.guards, ...binding.guards]);
  const interceptors = values<Interceptor>([...globals.interceptors, ...binding.interceptors]);
  const filters = values<ExceptionFilter>([...binding.filters, ...globals.filters]);
  const controller = recordValue(binding.controller);
  const handler: unknown = Reflect.get(Object(controller), binding.key);
  const arrays = def.query ? arrayKeys(def.query) : new Set<string>();

  // Object.fromEntries defines own keys, so `__proto__` stays a plain query key.
  function parseQuery(url: URL): Record<string, string | string[]> {
    return Object.fromEntries(
      [...new Set(url.searchParams.keys())].map((key) => {
        const all = url.searchParams.getAll(key);
        return [key, all.length > 1 || arrays.has(key) ? all : all[0]];
      }),
    );
  }

  /** Reads and validates the inputs into `ctx`; runs once per request. */
  async function validate(ctx: RequestContext): Promise<void> {
    const { req, url } = ctx;
    const inputs = {
      params: ctx.params,
      query: def.query && parseQuery(url),
      headers: def.headers && Object.fromEntries(req.headers),
      body: def.body && (await readJson(req, options.bodyLimit)),
    };
    const parts = (['params', 'query', 'headers', 'body'] as const).flatMap((part) => {
      const schema = def[part];
      return schema ? [{ part, schema }] : [];
    });
    const results = await Promise.all(
      parts.map(async ({ part, schema }) => schema['~standard'].validate(inputs[part])),
    );
    const errors: ValidationIssue[] = [];
    const validated: Record<string, unknown> = {};
    for (const [i, result] of results.entries()) {
      const { part } = parts[i];
      if (result.issues) {
        for (const issue of result.issues) {
          errors.push({ in: part, pointer: pointer(issue.path), message: issue.message });
        }
      } else validated[part] = result.value;
    }
    if (errors.length > 0) throw new HttpError(400, 'VALIDATION_FAILED', undefined, { errors });
    if ('params' in validated) validated.params = { ...ctx.params, ...Object(validated.params) };
    Object.assign(ctx, validated);
  }

  async function respond(value: unknown): Promise<Response> {
    if (value instanceof Response) return value;
    const { response, status } = def;
    if (!response) return new Response(null, { status: status ?? 204 });
    if (!('~standard' in response)) {
      if (!isBodyInit(value)) {
        const type =
          typeof value === 'object' && value
            ? (Object.getPrototypeOf(value)?.constructor?.name ?? 'Object')
            : typeof value;
        throw vibeError('VIBE9505', { route, type });
      }
      const headers = { 'content-type': response.contentType };
      return new Response(value, { status: status ?? 200, headers });
    }
    let body = value;
    if (options.validateResponses) {
      const result = await response['~standard'].validate(value);
      if (result.issues) {
        const issues = result.issues.map((i) => `${pointer(i.path)}: ${i.message}`).join('; ');
        throw vibeError('VIBE9501', { route, issues });
      }
      body = result.value;
    }
    return Response.json(body, { status: status ?? 200 });
  }

  async function handleError(error: unknown, ctx: RequestContext): Promise<Response> {
    let final = error;
    try {
      for (const filter of filters) {
        const result = await filter.catch(error, ctx);
        if (result instanceof Response) return result;
        if (result !== undefined) {
          final = result;
          break;
        }
      }
    } catch (thrown) {
      final = thrown;
    }
    if (
      isClientVisible(final) &&
      !BUILTIN.has(final.code) &&
      !Object.hasOwn(def.errors ?? {}, final.code)
    ) {
      const { message, code } = vibeError('VIBE9502', { code: final.code, route });
      ctx.log.warn(message, { code });
    }
    return renderError(final, ctx.requestId, ctx.log);
  }

  return async (ctx) => {
    try {
      for (const guard of guards) {
        if (!(await guard.canActivate(ctx))) throw new HttpError(403, 'FORBIDDEN');
      }
      // An interceptor may call next() more than once; the body stream can be read only once.
      let inputs: Promise<void> | undefined;
      const core = async () => {
        await (inputs ??= validate(ctx));
        return Reflect.apply(Object(handler), controller, [ctx]);
      };
      const run = (i: number): Promise<unknown> =>
        i === interceptors.length ? core() : interceptors[i].intercept(ctx, () => run(i + 1));
      return await respond(await run(0));
    } catch (error) {
      return handleError(error, ctx);
    }
  };
}
