// The dev-only HMR API. Compiled `.vibe` modules call `hmr` from their dev footer; prod builds
// never import it, so bundlers drop this module.
import { vibeError } from '../errors.gen.ts';
import type { ComponentDef } from '../internal.ts';
import { warn } from '../warn.ts';
import { recreateComponent, rerenderComponent } from './component.ts';
import { hmrRecords as records, type ComponentInstance, type HmrRecord } from './instance.ts';

/** The record of `id`; when there is none, warns VIBE5501 and reloads the page. */
function record(id: string): HmrRecord | undefined {
  const found = records.get(id);
  if (!found) {
    warn(vibeError('VIBE5501', { id }));
    location.reload();
  }
  return found;
}

/**
 * The record's def and every def its instances run: each re-executed module exports a new def
 * object under the same id, and instances a parent recreated from it read that object.
 */
function defs(found: HmrRecord): Set<ComponentDef> {
  const all = new Set([found.def]);
  for (const instance of found.instances) all.add(instance.def);
  return all;
}

export const hmr: {
  /** Registers `def` under `id`; `false` when `id` is known, which keeps the existing def. */
  createRecord(id: string, def: ComponentDef): boolean;
  /** A template-only edit: swaps the render and renders each live instance again, keeping its state. */
  rerender(id: string, render: ComponentDef['render']): void;
  /** Any other edit: updates the def in place and recreates each live instance through its parent. */
  reload(id: string, def: ComponentDef): void;
} = {
  createRecord(id, def) {
    if (records.has(id)) return false;
    records.set(id, { def, instances: new Set() });
    return true;
  },
  rerender(id, render) {
    const found = record(id);
    if (!found) return;
    for (const def of defs(found)) def.render = render;
    // A copy: rerendering adds and removes the instances of recursive components.
    for (const instance of Array.from(found.instances)) rerenderComponent(instance);
  },
  reload(id, def) {
    const found = record(id);
    if (!found) return;
    for (const target of defs(found)) {
      for (const key of Object.keys(target)) {
        if (!Object.hasOwn(def, key)) Reflect.deleteProperty(target, key);
      }
      Object.assign(target, def);
    }
    const parents = new Set<ComponentInstance>();
    for (const instance of Array.from(found.instances)) {
      if (instance.parent) parents.add(instance.parent);
      else recreateComponent(instance);
    }
    for (const parent of parents) rerenderComponent(parent);
  },
};
