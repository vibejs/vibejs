import type { GeneratorKind, Names } from './plan.ts';

const pascal = (s: string) => s[0].toUpperCase() + s.slice(1);
/** `blogPosts` and `BlogPosts` → `blog-posts`. */
export const hyphenate = (s: string): string =>
  s.replaceAll(/(?<=[a-z0-9])([A-Z])/g, '-$1').toLowerCase();

function resource({ name, singular }: Names): Record<string, string> {
  const Plural = pascal(name);
  const One = pascal(singular);
  const code = `${hyphenate(singular).replaceAll('-', '_').toUpperCase()}_NOT_FOUND`;
  const contract = `../../../contracts/src/${name}.contract.ts`;
  const notFound = `ctx.fail('${code}', \`No ${singular} \${ctx.params.id}\`)`;
  return {
    [`contracts/src/${name}.contract.ts`]: `import { defineContract, del, get, patch, post } from '@vibejs-org/contract';
import * as v from 'valibot';

export const ${One} = v.object({ id: v.string(), name: v.string() });
export type ${One} = v.InferOutput<typeof ${One}>;

export const Create${One} = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
});
export type Create${One} = v.InferOutput<typeof Create${One}>;

export const ${name} = defineContract('/${hyphenate(name)}', {
  list: get('/', { response: v.array(${One}) }),
  get: get('/:id', {
    response: ${One},
    errors: { ${code}: 404 },
  }),
  create: post('/', { body: Create${One}, response: ${One} }),
  update: patch('/:id', {
    body: Create${One},
    response: ${One},
    errors: { ${code}: 404 },
  }),
  remove: del('/:id', { errors: { ${code}: 404 } }),
});
`,
    [`server/src/${name}/${name}.service.ts`]: `import type { Create${One}, ${One} } from '${contract}';

export class ${Plural}Service {
  readonly #items = new Map<string, ${One}>();

  list(): ${One}[] {
    return [...this.#items.values()];
  }

  get(id: string): ${One} | undefined {
    return this.#items.get(id);
  }

  create(input: Create${One}): ${One} {
    const item = { ...input, id: crypto.randomUUID() };
    this.#items.set(item.id, item);
    return item;
  }

  /** Replaces the fields of \`id\`; \`undefined\` when there is none. */
  update(id: string, input: Create${One}): ${One} | undefined {
    if (!this.#items.has(id)) return undefined;
    const item = { ...input, id };
    this.#items.set(id, item);
    return item;
  }

  /** Removes \`id\`; \`false\` when there is none. */
  remove(id: string): boolean {
    return this.#items.delete(id);
  }
}
`,
    [`server/src/${name}/${name}.controller.ts`]: `import { Controller, Handle, inject, type Ctx } from '@vibejs-org/server';
import { ${name}, type ${One} } from '${contract}';
import { ${Plural}Service } from './${name}.service.ts';

@Controller(${name})
export class ${Plural}Controller {
  private readonly ${name} = inject(${Plural}Service);

  @Handle(${name}.list)
  list(): ${One}[] {
    return this.${name}.list();
  }

  @Handle(${name}.get)
  get(ctx: Ctx<typeof ${name}.get>): ${One} {
    const item = this.${name}.get(ctx.params.id);
    return item ?? ${notFound};
  }

  @Handle(${name}.create)
  create(ctx: Ctx<typeof ${name}.create>): ${One} {
    return this.${name}.create(ctx.body);
  }

  @Handle(${name}.update)
  update(ctx: Ctx<typeof ${name}.update>): ${One} {
    const item = this.${name}.update(ctx.params.id, ctx.body);
    return item ?? ${notFound};
  }

  @Handle(${name}.remove)
  remove(ctx: Ctx<typeof ${name}.remove>): void {
    if (!this.${name}.remove(ctx.params.id)) {
      ${notFound};
    }
  }
}
`,
    [`server/src/${name}/${name}.module.ts`]: `import { Module } from '@vibejs-org/server';
import { ${Plural}Controller } from './${name}.controller.ts';
import { ${Plural}Service } from './${name}.service.ts';

@Module({ providers: [${Plural}Service], controllers: [${Plural}Controller] })
export class ${Plural}Module {}
`,
    [`server/src/${name}/${name}.controller.test.ts`]: `import { createClient } from '@vibejs-org/contract';
import { JsonLogger } from '@vibejs-org/server';
import { Test } from '@vibejs-org/server/testing';
import { expect, it } from 'vitest';
import { ${name} } from '${contract}';
import { AppModule, appOptions } from '../app.module.ts';

async function setup() {
  const app = await Test.createTestingModule({
    imports: [AppModule],
    ...appOptions,
    logger: new JsonLogger({ level: 'silent' }),
  }).compile();
  const client = createClient({ ${name} }, { baseUrl: '/api', fetch: app.fetch });
  return { app, api: client.${name} };
}

it('creates, reads, updates, lists and removes ${name}', async () => {
  const { app, api } = await setup();
  const created = await api.create({ body: { name: 'First' } });
  if (!created.ok) throw new Error(created.error.code);
  const { id } = created.data;
  const found = await api.get({ params: { id } });
  expect(found).toMatchObject({ ok: true, data: { id, name: 'First' } });
  const updated = await api.update({ params: { id }, body: { name: 'Second' } });
  expect(updated).toMatchObject({ ok: true, data: { id, name: 'Second' } });
  expect(await api.list()).toMatchObject({ ok: true, data: [{ id, name: 'Second' }] });
  expect(await api.remove({ params: { id } })).toMatchObject({ ok: true });
  expect(await api.list()).toMatchObject({ ok: true, data: [] });
  await app.close();
});

it('answers an unknown id with ${code}', async () => {
  const { app, api } = await setup();
  const params = { id: 'missing' };
  const results = [
    await api.get({ params }),
    await api.update({ params, body: { name: 'First' } }),
    await api.remove({ params }),
  ];
  for (const r of results) {
    expect(r).toMatchObject({ ok: false, error: { code: '${code}', status: 404 } });
  }
  await app.close();
});
`,
  };
}

function component({ name }: Names): Record<string, string> {
  const css = hyphenate(name);
  return {
    [`ui/src/components/${name}.vibe`]: `<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="${css}">{{ title }}</div>
</template>
`,
    [`ui/src/components/${name}.test.ts`]: `import { mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import ${name} from './${name}.vibe';

it('renders its title', () => {
  const wrapper = mount(${name}, { props: { title: 'Hello' } });
  expect(wrapper.get('.${css}').text()).toBe('Hello');
});
`,
  };
}

/** The heading and route path of a page: `UsersPage` → `Users`, `/users`. */
export function pageRoute(name: string): { title: string; path: string } {
  const title = name.slice(0, -'Page'.length);
  return { title, path: `/${hyphenate(title)}` };
}

function page({ name }: Names): Record<string, string> {
  const { title, path } = pageRoute(name);
  return {
    [`ui/src/pages/${name}.vibe`]: `<template>
  <h1>${title}</h1>
</template>
`,
    [`ui/src/pages/${name}.test.ts`]: `import { createMemoryHistory, createRouter } from '@vibejs-org/ui/router';
import { mount } from '@vibejs-org/ui/testing';
import { expect, it } from 'vitest';
import App from '../App.vibe';
import { routes } from '../routes.ts';

it('shows the ${title} page at ${path}', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('${path}');
  const wrapper = mount(App, { plugins: [router] });
  expect(wrapper.get('h1').text()).toBe('${title}');
});
`,
  };
}

/** The files `vibejs generate` writes, by project-relative POSIX path. */
export const files = (kind: GeneratorKind, n: Names): Record<string, string> =>
  ({ resource, component, page })[kind](n);
