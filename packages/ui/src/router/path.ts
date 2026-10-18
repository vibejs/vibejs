// Upstream: vuejs/router@47b95baae1ebdeb564bd1adf8168c9e9d6d09d0a packages/router/src/matcher/pathParserRanker.ts (MIT)
// Copyright (c) 2019-present Eduardo San Martin Morote
//
// Ports the PathScore values and the score comparator. The tokenizer and the regex builder are
// rewritten for a grammar of one token per segment, with named groups and no path options.
import { vibeError } from '../errors.gen.ts';
import type { RouteParams, RouteParamsRaw } from './types.ts';

interface Param {
  name: string;
  optional: boolean;
  repeatable: boolean;
}

export interface PathParser {
  readonly re: RegExp;
  /** One score per segment. */
  readonly score: readonly number[];
  /** A segment is static text or a param; `''` is an empty segment. */
  readonly segments: readonly (string | Param)[];
}

// Scores of one segment.
const ROOT = 90; // an empty segment: `/` or a trailing slash
const STATIC = 80;
const PARAM = 60;
const CUSTOM_REGEX = 10;
const WILDCARD = -50; // `(.*)`, cancels the custom regex bonus
const REPEATABLE = -20;
const OPTIONAL = -8;

const DEFAULT_REGEX = '[^/]+';
const PARAM_SEGMENT = /^:(\w+)(?:\((.*)\))?([?*+]?)$/;

/** Encodes static text the way `URL` encodes a location path, so that both compare equal. */
const encodeStatic = (text: string): string => new URL(text, 'http://x/').pathname.slice(1);

/** Validates a full path (VIBE7101) and builds its matcher. */
export function parsePath(path: string): PathParser {
  const fail = (reason: string) => vibeError('VIBE7101', { path, reason });
  if (!path.startsWith('/')) throw fail('it must start with "/"');
  const raw = [''];
  let depth = 0;
  for (let i = 1; i < path.length; i++) {
    const char = path[i];
    if (char === '\\') {
      if (!depth) throw fail('escapes with "\\" are not supported');
      raw[raw.length - 1] += char + path.charAt(++i);
      continue;
    }
    if (char === '/' && depth) throw fail('a param regex cannot contain "/"');
    if (char === '(') depth++;
    if (char === ')' && --depth < 0) throw fail('the parentheses are unbalanced');
    if (char === '/') raw.push('');
    else raw[raw.length - 1] += char;
  }
  if (depth) throw fail('the parentheses are unbalanced');

  const segments: (string | Param)[] = [];
  const score: number[] = [];
  let source = '^';
  for (const segment of raw) {
    if (!segment.includes(':')) {
      segments.push(segment);
      score.push(segment ? STATIC : ROOT);
      if (segment) source += '/' + encodeStatic(segment).replace(/[.+*?^${}()[\]|\\]/g, '\\$&');
      continue;
    }
    const match = PARAM_SEGMENT.exec(segment);
    if (!match) throw fail(`the segment "${segment}" mixes static text and a param`);
    const [, name, regex = DEFAULT_REGEX, modifier] = match;
    const param = {
      name,
      optional: modifier === '?' || modifier === '*',
      repeatable: modifier === '*' || modifier === '+',
    };
    const group = `(?<p${segments.length}>${param.repeatable ? `(?:${regex})(?:/(?:${regex}))*` : regex})`;
    source += param.optional ? `(?:/${group})?` : `/${group}`;
    segments.push(param);
    score.push(
      PARAM +
        (regex === DEFAULT_REGEX ? 0 : CUSTOM_REGEX) +
        (regex === '.*' ? WILDCARD : 0) +
        (param.repeatable ? REPEATABLE : 0) +
        (param.optional ? OPTIONAL : 0),
    );
  }
  try {
    return { re: new RegExp(source + '/?$', 'i'), score, segments };
  } catch (error) {
    throw fail(`a param regex does not compile (${String(error)})`);
  }
}

/** Sorts the higher score first. */
export function comparePaths(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  // A splat at the end of the longer path (`/a/:rest(.*)*`) sorts it after the shorter one.
  if (Math.abs(b.length - a.length) === 1) {
    if (a.at(-1)! < 0) return 1;
    if (b.at(-1)! < 0) return -1;
  }
  return b.length - a.length;
}

/** The decoded params of `path`, or `undefined` when it does not match. */
export function matchPath(parser: PathParser, path: string): RouteParams | undefined {
  const match = parser.re.exec(path);
  if (!match) return undefined;
  const groups = match.groups ?? {};
  const params: RouteParams = {};
  parser.segments.forEach((param, i) => {
    if (typeof param === 'string') return;
    // An absent group is `undefined`; an empty match counts as absent too.
    const value = groups[`p${i}`];
    if (param.repeatable) params[param.name] = value ? value.split('/').map(decode) : [];
    else if (value) params[param.name] = decode(value);
  });
  return params;
}

/** Builds the encoded path and the normalized params (VIBE7104, VIBE7118). */
export function buildPath(
  parser: PathParser,
  raw: RouteParamsRaw,
  route: string,
): { path: string; params: RouteParams } {
  const params: RouteParams = {};
  const parts: string[] = [];
  for (const param of parser.segments) {
    if (typeof param === 'string') {
      parts.push(encodeStatic(param));
      continue;
    }
    const value = raw[param.name];
    const invalid = (expected: string) =>
      vibeError('VIBE7118', { param: param.name, route, expected });
    const list = Array.isArray(value);
    if (value !== undefined && value !== null && list !== param.repeatable) {
      throw invalid(param.repeatable ? 'an array' : 'a single value, not an array');
    }
    const values: string[] = list
      ? (value as readonly (string | number)[]).map(String)
      : value === undefined || value === null || value === ''
        ? []
        : [String(value)];
    if (!values.length && !param.optional) {
      throw list
        ? invalid('a non-empty array')
        : vibeError('VIBE7104', { route, param: param.name });
    }
    if (param.repeatable) params[param.name] = values;
    else if (values.length) params[param.name] = values[0];
    if (values.length) parts.push(values.map(encodeURIComponent).join('/'));
  }
  return { path: '/' + parts.join('/'), params };
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape, such as `%E0`, stays as it is.
    return value;
  }
}
