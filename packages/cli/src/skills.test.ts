// The workflow skills in the repo's skills/ folder, which `agents sync` and create-vibejs ship.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog.gen.ts';
import { COMMANDS } from './main.ts';
import { TOOLS } from './mcp.ts';

const SKILLS = fileURLToPath(new URL('../../../skills', import.meta.url));
const names = readdirSync(SKILLS).toSorted();
const OPENING =
  '`vibejs` means the local CLI command named in AGENTS.md (`pnpm exec vibejs`, `npx --no vibejs` or `yarn vibejs`).';

it('ships exactly the three workflow skills', () => {
  expect(names).toEqual(['vibejs-add-resource', 'vibejs-cover-100', 'vibejs-dev-loop']);
});

describe.each(names)('%s', (name) => {
  const text = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
  const [, frontmatter, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)!;
  const fields = Object.fromEntries(
    frontmatter
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]),
  );

  it('has only name, description and license in its frontmatter', () => {
    expect(Object.keys(fields)).toEqual(['name', 'description', 'license']);
    expect(fields.name).toBe(name);
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(fields.description.length).toBeGreaterThan(0);
    expect(fields.description.length).toBeLessThanOrEqual(1024);
    expect(fields.license).toBe('MIT');
  });

  it('has a body of at most 500 lines that names the local CLI first', () => {
    expect(body.split('\n').length).toBeLessThanOrEqual(500);
    expect(body).toContain(OPENING);
  });

  it('names only real commands, error codes and MCP tools', () => {
    const commands = [...body.matchAll(/\bvibejs ([a-z]+)\b/g)].map((m) => m[1]);
    expect(commands.length).toBeGreaterThan(0);
    const known = COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
    expect(commands.filter((c) => !known.includes(c))).toEqual([]);
    const codes = body.match(/VIBE\d{4}/g) ?? [];
    expect(codes.filter((code) => !CATALOG.some((e) => e.code === code))).toEqual([]);
    const tools = [...body.matchAll(/MCP tool `(\w+)`/g)].map((m) => m[1]);
    expect(tools.filter((tool) => !TOOLS.some((t) => t.name === tool))).toEqual([]);
  });
});

it('names every MCP tool in the dev loop', () => {
  const body = readFileSync(join(SKILLS, 'vibejs-dev-loop/SKILL.md'), 'utf8');
  const tools = new Set([...body.matchAll(/MCP tool `(\w+)`/g)].map((m) => m[1]));
  expect([...tools].toSorted()).toEqual(TOOLS.map((t) => t.name).toSorted());
});
