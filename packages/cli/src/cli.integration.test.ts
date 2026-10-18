import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import manifest from '../package.json' with { type: 'json' };

const BIN = fileURLToPath(new URL('../dist/bin.js', import.meta.url));

// Preloaded with --import: any fetch or TCP connection throws.
const OFFLINE = `data:text/javascript,${encodeURIComponent(`
import net from 'node:net';
const offline = () => { throw new Error('network disabled by the offline preload'); };
globalThis.fetch = offline;
net.Socket.prototype.connect = offline;
`)}`;

function vibejs(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    ['--import', OFFLINE, BIN, ...args],
    { encoding: 'utf8', env: { ...process.env, VIBEJS_AGENT: '1' } },
  );
  return { status, stdout, stderr };
}

function single(stdout: string): unknown {
  expect(stdout.endsWith('\n')).toBe(true);
  expect(stdout.slice(0, -1)).not.toContain('\n');
  expect(stdout).not.toContain('\u001b[');
  return JSON.parse(stdout);
}

it('the offline preload blocks the network', () => {
  const { status, stderr } = spawnSync(
    process.execPath,
    ['--import', OFFLINE, '-e', "require('node:net').connect(80, '127.0.0.1')"],
    { encoding: 'utf8' },
  );
  expect(status).toBe(1);
  expect(stderr).toContain('network disabled by the offline preload');
});

it('answers explain without a code with one VIBE8003 object and exit 2', () => {
  const { status, stdout, stderr } = vibejs('explain');
  expect(status).toBe(2);
  expect(stderr).toBe('');
  expect(single(stdout)).toMatchObject({
    ok: false,
    command: 'explain',
    error: { code: 'VIBE8003', missing: [{ name: 'code', example: 'vibejs explain VIBE8003' }] },
  });
});

it('explains a code offline from the bundled catalog', () => {
  const { status, stdout, stderr } = vibejs('explain', 'VIBE8003');
  expect(status).toBe(0);
  expect(stderr).toBe('');
  expect(single(stdout)).toMatchObject({
    ok: true,
    command: 'explain',
    version: manifest.version,
    entry: { code: 'VIBE8003', title: 'Missing required input' },
  });
});

it('exits 1 with VIBE8008 for an unknown code', () => {
  const { status, stdout } = vibejs('explain', 'VIBE0000');
  expect(status).toBe(1);
  expect(single(stdout)).toMatchObject({ ok: false, error: { code: 'VIBE8008' } });
});

it('prints the package version', () => {
  const { status, stdout } = vibejs('--version');
  expect(status).toBe(0);
  expect(single(stdout)).toEqual({ ok: true, command: 'version', version: manifest.version });
});
