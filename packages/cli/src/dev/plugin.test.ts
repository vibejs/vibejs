import { Logger as ServerLogger } from '@vibejs-org/server';
import { createLogger } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import type { DevLog, LogEntry } from './log.ts';
import { serverLogger, viteLogger } from './plugin.ts';

const ROOT = '/project';

function recorder() {
  const entries: Omit<LogEntry, 't'>[] = [];
  const log: DevLog = { write: (e) => entries.push(e), failed: new Set(), close: () => {} };
  return { log, entries };
}

function setup() {
  const base = createLogger('silent');
  const calls = vi.spyOn(base, 'error');
  const { log, entries } = recorder();
  return { logger: viteLogger(ROOT, log, base), entries, calls };
}

describe('viteLogger', () => {
  // As Vite 8's forwardConsole plugin formats them, colors included.
  const FORWARDED = {
    consoleError: '\u001b[2m[console.error] \u001b[22mfixture',
    consoleWarn: '\u001b[2m[console.warn] \u001b[22mcareful',
    rejection:
      '\u001b[31m[Unhandled rejection] \u001b[1mError\u001b[22m: fixture rejection\n\u001b[39m > src/main.ts:6:39\n',
    error: '\u001b[31m[Unhandled error] \u001b[1mTypeError\u001b[22m: x is undefined\n\u001b[39m',
  };

  it('maps messages forwarded from the browser to source browser, without colors', () => {
    const { logger, entries, calls } = setup();
    logger.error(FORWARDED.consoleError, { timestamp: true });
    logger.warn(FORWARDED.consoleWarn, { timestamp: true });
    logger.error(FORWARDED.rejection, { timestamp: true });
    logger.error(FORWARDED.error, { timestamp: true });
    expect(calls).toHaveBeenCalledTimes(3);
    expect(entries).toEqual([
      { level: 'error', source: 'browser', msg: '[console.error] fixture' },
      { level: 'warn', source: 'browser', msg: '[console.warn] careful' },
      {
        level: 'error',
        source: 'browser',
        msg: '[Unhandled rejection] Error: fixture rejection\n > src/main.ts:6:39',
      },
      { level: 'error', source: 'browser', msg: '[Unhandled error] TypeError: x is undefined' },
    ]);
  });

  it('maps other messages to source vite', () => {
    const { logger, entries } = setup();
    logger.info('page reload src/main.ts');
    logger.warnOnce('once');
    logger.error('Internal server error: boom', { error: new Error('boom') });
    expect(entries).toEqual([
      { level: 'info', source: 'vite', msg: 'page reload src/main.ts' },
      { level: 'warn', source: 'vite', msg: 'once' },
      { level: 'error', source: 'vite', msg: 'Internal server error: boom' },
    ]);
  });

  it('takes the code and location of a C2 error with a VIBE code', () => {
    const { logger, entries } = setup();
    const located = {
      code: 'VIBE1001',
      id: `${ROOT}/ui/src/A.vibe?vue`,
      loc: { line: 2, column: 5 },
    };
    logger.error('x', { error: Object.assign(new Error('x'), located) });
    logger.error('y', {
      error: Object.assign(new Error('y'), { code: 'VIBE1002', id: `${ROOT}/ui/b.ts` }),
    });
    logger.error('z', {
      error: Object.assign(new Error('z'), { code: 'PARSE_ERROR', id: `${ROOT}/c.ts` }),
    });
    logger.error('w', { error: Object.assign(new Error('w'), { code: 'VIBE1003' }) });
    expect(entries).toEqual([
      {
        level: 'error',
        source: 'vite',
        msg: 'x',
        code: 'VIBE1001',
        file: 'ui/src/A.vibe',
        line: 2,
        column: 5,
      },
      {
        level: 'error',
        source: 'vite',
        msg: 'y',
        code: 'VIBE1002',
        file: 'ui/b.ts',
        line: undefined,
        column: undefined,
      },
      { level: 'error', source: 'vite', msg: 'z' },
      { level: 'error', source: 'vite', msg: 'w' },
    ]);
  });
});

describe('serverLogger', () => {
  it('writes source server entries with the VIBE code and the stack of an error field', () => {
    const { log, entries } = recorder();
    const logger = serverLogger(ServerLogger, log);
    expect(logger).toBeInstanceOf(ServerLogger);
    const cause = new Error('boom');
    const error = new Error('bad');
    logger.debug('request', { requestId: 'r1' });
    logger.info('listening');
    logger.warn('slow', { code: 'VIBE9402' });
    logger.error('failed', { code: 'VIBE9503', cause });
    logger.child({ requestId: 'r2', code: 'VIBE9101' }).child({ error }).error('nested');
    logger.error('not a code', { code: 'E_FAIL', cause: 'text' });
    expect(entries).toEqual([
      { level: 'debug', source: 'server', msg: 'request', code: undefined, stack: undefined },
      { level: 'info', source: 'server', msg: 'listening', code: undefined, stack: undefined },
      { level: 'warn', source: 'server', msg: 'slow', code: 'VIBE9402', stack: undefined },
      { level: 'error', source: 'server', msg: 'failed', code: 'VIBE9503', stack: cause.stack },
      { level: 'error', source: 'server', msg: 'nested', code: 'VIBE9101', stack: error.stack },
      { level: 'error', source: 'server', msg: 'not a code', code: undefined, stack: undefined },
    ]);
  });
});
