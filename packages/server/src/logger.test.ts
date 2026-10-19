import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLog } from '../test/log.ts';
import { JsonLogger, type Logger, type LogLevel } from './logger.ts';

const capture = (level?: LogLevel) => captureLog(level, { app: 'test' });

const all = (logger: Logger) => {
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('JsonLogger', () => {
  it('writes one JSON line per entry with time, level, msg and fields', () => {
    const { lines, logger } = capture();
    logger.info('started', { port: 3000 });
    expect(lines).toEqual([
      {
        time: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/),
        level: 'info',
        msg: 'started',
        app: 'test',
        port: 3000,
      },
    ]);
  });

  it.each([
    ['debug', ['d', 'i', 'w', 'e']],
    ['info', ['i', 'w', 'e']],
    ['warn', ['w', 'e']],
    ['error', ['e']],
    ['silent', []],
    [undefined, ['i', 'w', 'e']],
  ] as const)('drops entries below %s', (level, kept) => {
    const { lines, logger } = capture(level);
    all(logger);
    expect(lines.map((line) => line.msg)).toEqual(kept);
  });

  it('merges child fields over the parent fields', () => {
    const { lines, logger } = capture('debug');
    logger.child({ requestId: 'r1' }).child({ app: 'child' }).debug('x', { n: 1 });
    expect(lines[0]).toMatchObject({ app: 'child', requestId: 'r1', n: 1, level: 'debug' });
  });

  it('serializes top-level Error fields with code and nested cause', () => {
    const { lines, logger } = capture();
    const inner = Object.assign(new Error('inner'), { code: 'E_INNER' });
    const error = new TypeError('outer', { cause: inner });
    logger.error('failed', { error, cause: 'text', nested: { error: inner } });
    expect(lines[0]).toMatchObject({
      error: {
        name: 'TypeError',
        message: 'outer',
        stack: expect.stringContaining('TypeError: outer'),
        cause: { name: 'Error', message: 'inner', code: 'E_INNER', stack: expect.any(String) },
      },
      cause: 'text',
      nested: { error: {} },
    });
    expect(lines[0].error).not.toHaveProperty('code');
    expect(lines[0].error).not.toHaveProperty('cause.cause');
  });

  it('writes BigInt as a string and ends an object cycle', () => {
    const { lines, logger } = capture();
    const loop: Record<string, unknown> = { n: 1n };
    loop.self = loop;
    logger.error('failed', { cause: new Error('x', { cause: loop }) });
    expect(lines[0]).toMatchObject({
      cause: { message: 'x', cause: { n: '1', self: '[Circular]' } },
    });
  });

  it('ends a cause cycle and keeps its own time, level and msg', () => {
    const { lines, logger } = capture();
    const error = new Error('loop');
    error.cause = error;
    logger.error('failed', { error, time: 0, level: 'debug', msg: 'other' });
    expect(lines[0]).toMatchObject({
      level: 'error',
      msg: 'failed',
      error: { cause: '[Circular]' },
    });
    expect(lines[0].time).not.toBe(0);
  });

  it('writes to console.log by default', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    new JsonLogger().warn('careful');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"msg":"careful"'));
  });
});
