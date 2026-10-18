// @vitest-environment node
// Upstream: vuejs/router@47b95baae1ebdeb564bd1adf8168c9e9d6d09d0a packages/router/__tests__/matcher/pathRanking.spec.ts (MIT)
// Upstream: vuejs/router@47b95baae1ebdeb564bd1adf8168c9e9d6d09d0a packages/router/__tests__/matcher/pathParser.spec.ts (MIT)
//
// Limited to the supported grammar: one token per segment, no `strict`, `sensitive`, `start` or
// `end` options, and every path starts with `/`. Scores have one number per segment. An absent
// optional param is a missing key and an absent `*` param is `[]`, where upstream gives `''`.
// Regex assertions check what a regex matches instead of its source.
import { describe, expect, it } from 'vitest';
import { buildPath, comparePaths, matchPath, parsePath } from './path.ts';

const code = (value: string) => expect.objectContaining({ code: value });

/** Sorts `paths` from the reversed order; different paths must not share a score. */
function rank(paths: string[]): string[] {
  const parsers = paths.map((path) => ({ path, ...parsePath(path) }));
  parsers.reverse();
  parsers.sort((a, b) => comparePaths(a.score, b.score));
  for (let i = 0; i < parsers.length - 1; i++) {
    if (String(parsers[i].score) === String(parsers[i + 1].score)) {
      throw new Error(`${parsers[i].path} and ${parsers[i + 1].path} share a score`);
    }
  }
  return parsers.map((parser) => parser.path);
}

const match = (path: string, pathToTest: string) => matchPath(parsePath(path), pathToTest);
const build = (path: string, params: Parameters<typeof buildPath>[1]) =>
  buildPath(parsePath(path), params, path).path;

describe('Path ranking', () => {
  describe('comparePaths', () => {
    it('same length', () => {
      expect(comparePaths([2], [3])).toBe(1);
      expect(comparePaths([2], [2])).toBe(0);
      expect(comparePaths([4], [3])).toBe(-1);
    });

    it('longer', () => {
      expect(comparePaths([2], [3, 1])).toBe(1);
      expect(comparePaths([3], [3, 1])).toBe(1);
      expect(comparePaths([1, 3], [2])).toBe(1);
      expect(comparePaths([], [3])).toBe(1);
    });

    it('sorts a path ending in a negative score after the one segment shorter path', () => {
      expect(comparePaths([80, -8], [80])).toBe(1);
      expect(comparePaths([80], [80, -8])).toBe(-1);
    });
  });

  it('works', () => {
    expect(rank(['/a/b/c', '/a/b', '/a/:b/c', '/a/:b', '/a', '/:a/:b', '/:w', '/:w+'])).toEqual([
      '/a/b/c',
      '/a/b',
      '/a/:b/c',
      '/a/:b',
      '/a',
      '/:a/:b',
      '/:w',
      '/:w+',
    ]);
  });

  it('puts the slash before optional parameters', () => {
    expect(rank(['/', '/:a?'])).toEqual(['/', '/:a?']);
    expect(rank(['/', '/:a*'])).toEqual(['/', '/:a*']);
    expect(rank(['/', '/:a(\\d+)?'])).toEqual(['/', '/:a(\\d+)?']);
    expect(rank(['/', '/:a(\\d+)*'])).toEqual(['/', '/:a(\\d+)*']);
  });

  it('puts catchall param after same prefix', () => {
    expect(rank(['/a', '/a/:a(.*)*'])).toEqual(['/a', '/a/:a(.*)*']);
  });

  it('orders repeatable and optional', () => {
    expect(rank(['/:w', '/:w?'])).toEqual(['/:w', '/:w?']);
    expect(rank(['/:w?', '/:w+'])).toEqual(['/:w?', '/:w+']);
    expect(rank(['/:w+', '/:w*'])).toEqual(['/:w+', '/:w*']);
    expect(rank(['/:w+', '/:w(.*)'])).toEqual(['/:w+', '/:w(.*)']);
  });

  it('orders static before params', () => {
    expect(rank(['/a', '/:id'])).toEqual(['/a', '/:id']);
  });

  it('works with long paths', () => {
    expect(rank(['/a/b/c/d/e', '/:k/b/c/d/e', '/:k/b/c/d/:j'])).toEqual([
      '/a/b/c/d/e',
      '/:k/b/c/d/e',
      '/:k/b/c/d/:j',
    ]);
  });

  it('prioritizes custom regex', () => {
    expect(rank(['/:a(\\d+)', '/:a', '/:a(.*)'])).toEqual(['/:a(\\d+)', '/:a', '/:a(.*)']);
  });

  it('prioritizes ending slashes', () => {
    expect(rank(['/a/', '/a'])).toEqual(['/a/', '/a']);
    expect(rank(['/a/b/', '/a/b'])).toEqual(['/a/b/', '/a/b']);
  });

  it('puts the wildcard at the end', () => {
    for (const path of [
      '/',
      '/ab',
      '/:a',
      '/:a?',
      '/:a+',
      '/:a*',
      '/:a(\\d+)',
      '/:a(\\d+)?',
      '/:a(\\d+)+',
      '/:a(\\d+)*',
    ]) {
      expect(rank([path, '/:rest(.*)'])).toEqual([path, '/:rest(.*)']);
    }
  });

  it('scores root 90, static 80, param 60 and the param modifiers', () => {
    expect(parsePath('/').score).toEqual([90]);
    expect(parsePath('/a/').score).toEqual([80, 90]);
    expect(parsePath('/:a/:b(\\d+)/:c(.*)').score).toEqual([60, 70, 20]);
    expect(parsePath('/:a?/:b+/:c*/:d(.*)*').score).toEqual([52, 40, 32, -8]);
  });
});

describe('Path parser', () => {
  describe('tokenizer', () => {
    it('escapes ( inside custom re', () => {
      expect(match('/:a(\\))', '/)')).toEqual({ a: ')' });
    });

    it('param custom re followed by new segment', () => {
      expect(match('/:id(\\d+)/new', '/12/new')).toEqual({ id: '12' });
      expect(match('/:id(\\d+)/new', '/ab/new')).toEqual(undefined);
    });
  });

  describe('regex', () => {
    it('static single', () => {
      expect(match('/', '/')).toEqual({});
      expect(match('/', '')).toEqual({});
      expect(match('/home', '/home')).toEqual({});
      expect(match('/home/other', '/home/other')).toEqual({});
    });

    it('regex special characters', () => {
      // A location path is encoded by URL, which encodes `^` but not `$`, `[`, `|` or `(`.
      expect(match('/foo$^', '/foo$%5E')).toEqual({});
      // `?` starts the query of a location, so static text rejects it (VIBE7101).
      expect(match('/foo+.*', '/foo+.*')).toEqual({});
      expect(match('/foo+.*', '/foooo')).toEqual(undefined);
      expect(match('/foo[ea]', '/foo[ea]')).toEqual({});
      expect(match('/foo[ea]', '/fooe')).toEqual(undefined);
      expect(match('/foo(e|a)', '/foo(e|a)')).toEqual({});
      expect(match('/foo(e|a)', '/fooe')).toEqual(undefined);
      expect(match('/foo(e|a)', '/a)')).toEqual(undefined);
    });

    it('matches encoded static text', () => {
      expect(match('/café menu', '/caf%C3%A9%20menu')).toEqual({});
      expect(match('/100%25', '/100%25')).toEqual({});
    });
  });

  describe('parsing urls', () => {
    it('returns null if no match', () => {
      expect(match('/home', '/')).toEqual(undefined);
    });

    it('allows a trailing slash', () => {
      expect(match('/home', '/home/')).toEqual({});
      expect(match('/a/b', '/a/b/')).toEqual({});
    });

    it('allow a trailing slash in repeated params', () => {
      expect(match('/a/:id+', '/a/b/c/d/')).toEqual({ id: ['b', 'c', 'd'] });
      expect(match('/a/:id*', '/a/b/c/d/')).toEqual({ id: ['b', 'c', 'd'] });
      expect(match('/a/:id*', '/a/')).toEqual({ id: [] });
      expect(match('/a/:id*', '/a')).toEqual({ id: [] });
    });

    it('is insensitive by default', () => {
      expect(match('/home', '/HOMe')).toEqual({});
    });

    it('defaults to matching the end', () => {
      expect(match('/home', '/home')).toEqual({});
      expect(match('/home', '/home/')).toEqual({});
      expect(match('/home', '/home/other')).toEqual(undefined);
      expect(match('/home', '/homepage')).toEqual(undefined);
      expect(match('/home/', '/home')).toEqual({});
      expect(match('/home/', '/home/')).toEqual({});
      expect(match('/home/', '/home/other')).toEqual(undefined);
      expect(match('/home/', '/homepage')).toEqual(undefined);
    });

    it('returns an empty object with no keys', () => {
      expect(match('/home', '/home')).toEqual({});
    });

    it('param single', () => {
      expect(match('/:id', '/a')).toEqual({ id: 'a' });
    });

    it('catch all', () => {
      expect(match('/:rest(.*)', '/a/b/c')).toEqual({ rest: 'a/b/c' });
      expect(match('/:rest(.*)/no', '/a/b/c/no')).toEqual({ rest: 'a/b/c' });
    });

    it('catch all non-greedy', () => {
      expect(match('/:rest(.*?)/b/:other(.*)', '/a/b/c/b/d')).toEqual({
        rest: 'a',
        other: 'c/b/d',
      });
    });

    it('param optional', () => {
      expect(match('/:a?', '/one')).toEqual({ a: 'one' });
      expect(match('/:a*', '/one')).toEqual({ a: ['one'] });
    });

    it('empty param optional', () => {
      expect(match('/:a?', '/')).toEqual({});
      expect(match('/:a*', '/')).toEqual({ a: [] });
    });

    it('static then empty param optional', () => {
      expect(match('/a/:a?', '/a')).toEqual({});
      expect(match('/a/:a?', '/a/a')).toEqual({ a: 'a' });
      expect(match('/a/:a?', '/a/a/')).toEqual({ a: 'a' });
      expect(match('/a/:a?', '/a/')).toEqual({});
      expect(match('/a/:a*', '/a')).toEqual({ a: [] });
      expect(match('/a/:a*', '/a/')).toEqual({ a: [] });
    });

    it('static then param optional', () => {
      expect(match('/one/:a?', '/one/two')).toEqual({ a: 'two' });
      expect(match('/one/:a?', '/one/')).toEqual({});
      // can only match one time
      expect(match('/one/:a?', '/one/two/three')).toEqual(undefined);
      expect(match('/one/:a*', '/one/two')).toEqual({ a: ['two'] });
    });

    it('param optional followed by static', () => {
      expect(match('/:a?/one', '/two/one')).toEqual({ a: 'two' });
      // since the first one is optional
      expect(match('/:a?/one', '/one')).toEqual({});
      expect(match('/:a?/one', '/two')).toEqual(undefined);
      // can only match one time
      expect(match('/:a?/one', '/two/three/one')).toEqual(undefined);
      expect(match('/:a*/one', '/two/one')).toEqual({ a: ['two'] });
    });

    it('param repeatable', () => {
      expect(match('/:a+', '/one/two')).toEqual({ a: ['one', 'two'] });
      expect(match('/:a*', '/one/two')).toEqual({ a: ['one', 'two'] });
    });

    it('param repeatable with static', () => {
      expect(match('/one/:a+', '/one/two')).toEqual({ a: ['two'] });
      expect(match('/one/:a+', '/one/two/three')).toEqual({ a: ['two', 'three'] });
      expect(match('/one/:a*', '/one/two')).toEqual({ a: ['two'] });
      expect(match('/one/:a*', '/one/two/three')).toEqual({ a: ['two', 'three'] });
    });

    it('decodes params and keeps a malformed escape', () => {
      expect(match('/:a/:b+', '/x%20y/a%2Fb/%E2%82%AC')).toEqual({ a: 'x y', b: ['a/b', '€'] });
      expect(match('/:a', '/%E0')).toEqual({ a: '%E0' });
    });

    it('keeps capture groups of a param regex out of the params', () => {
      expect(match('/:a((x)|y)/:b', '/x/z')).toEqual({ a: 'x', b: 'z' });
    });
  });

  describe('generating urls', () => {
    it('no params one segment', () => {
      expect(build('/home', {})).toBe('/home');
    });

    it('works with trailing slash', () => {
      expect(build('/home/', {})).toBe('/home/');
    });

    it('single param one segment', () => {
      expect(build('/:id', { id: 'one' })).toBe('/one');
    });

    it('repeatable params+', () => {
      expect(build('/:a+', { a: ['one', 'two'] })).toBe('/one/two');
    });

    it('repeatable params+ with extra segment', () => {
      expect(build('/:a+/other', { a: ['one', 'two'] })).toBe('/one/two/other');
    });

    it('repeatable params*', () => {
      expect(build('/:a*', { a: ['one', 'two'] })).toBe('/one/two');
    });

    it('static then optional param?', () => {
      expect(build('/a/:a?', { a: '' })).toBe('/a');
      expect(build('/a/:a?', {})).toBe('/a');
    });

    it('optional param?', () => {
      expect(build('/:a?/other', { a: '' })).toBe('/other');
      expect(build('/:a?/other', { a: null })).toBe('/other');
      expect(build('/:a?/other', {})).toBe('/other');
    });

    it('optional param*', () => {
      expect(build('/:a*/other', { a: [] })).toBe('/other');
      expect(build('/:a*/other', {})).toBe('/other');
    });

    it('encodes values and normalizes the params', () => {
      const parser = parsePath('/café/:id/:rest*');
      expect(buildPath(parser, { id: 'a/b c', rest: [1, '%'] }, 'r')).toEqual({
        path: '/caf%C3%A9/a%2Fb%20c/1/%25',
        params: { id: 'a/b c', rest: ['1', '%'] },
      });
      expect(buildPath(parsePath('/:id?/:all*'), { id: 7 }, 'r').params).toEqual({
        id: '7',
        all: [],
      });
    });
  });
});

describe('VIBE7101', () => {
  it.each([
    ['/:a-:b', 'mixes static text and a param'],
    ['/file.:ext', 'mixes static text and a param'],
    ['/:a(\\d+)b', 'mixes static text and a param'],
    ['/:a([^/]+)', 'cannot contain "/"'],
    ['/:p(a\\/b)', 'cannot contain "/"'],
    ['/:a(x)(y)', 'one non-empty param regex'],
    ['/:id()', 'one non-empty param regex'],
    ['/what?', 'contains "?" or "#"'],
    ['/a#b', 'contains "?" or "#"'],
    ['/a/./b', 'dot segment'],
    ['/a/..', 'dot segment'],
    ['/a/%2E%2e', 'dot segment'],
    ['/\\:a', 'escapes'],
    ['/:a(\\d+', 'unbalanced'],
    ['/:a)', 'unbalanced'],
    ['/:a([)', 'does not compile'],
    ['users', 'must start with "/"'],
    ['', 'must start with "/"'],
  ])('rejects %s', (path, reason) => {
    expect(() => parsePath(path)).toThrow(code('VIBE7101'));
    expect(() => parsePath(path)).toThrow(reason);
  });
});

const invalid = (args: object) =>
  expect.objectContaining({ code: 'VIBE7118', args: expect.objectContaining(args) });

describe('VIBE7104 and VIBE7118', () => {
  it('needs a required param', () => {
    expect(() => buildPath(parsePath('/:id'), {}, 'user')).toThrow(code('VIBE7104'));
    expect(() => buildPath(parsePath('/:id'), { id: '' }, 'user')).toThrow(code('VIBE7104'));
    expect(() => buildPath(parsePath('/:id+'), {}, 'user')).toThrow(code('VIBE7104'));
  });

  it('rejects a bad repeatable value', () => {
    expect(() => buildPath(parsePath('/:p+'), { p: 'a' }, 'files')).toThrow(
      invalid({ param: 'p', route: 'files', expected: 'an array' }),
    );
    expect(() => build('/:p*', { p: 'a' })).toThrow(invalid({ expected: 'an array' }));
    expect(() => build('/:p+', { p: [] })).toThrow(invalid({ expected: 'a non-empty array' }));
    expect(() => build('/:p', { p: ['a'] })).toThrow(
      invalid({ expected: 'a single value, not an array' }),
    );
    expect(() => build('/:p', { p: '..' })).toThrow(
      invalid({ expected: 'a value other than "." or ".."' }),
    );
    expect(() => build('/:p+', { p: ['a', '.'] })).toThrow(invalid({ param: 'p' }));
  });
});
