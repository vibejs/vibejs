import type { AppInspection } from '@vibejs-org/server';
import type { CommandDef } from '../command.ts';
import { loadAppModule, loadError, withServerRunner } from '../dev/app-module.ts';
import { envelopeError, type JsonEnvelope } from '../output.ts';
import { fullstackRoot } from '../project.ts';

export interface DiResult extends JsonEnvelope {
  /** `[]` on error. */
  modules: AppInspection['modules'];
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const list = (names: readonly string[]) => names.join(', ') || '-';

export const di: CommandDef<DiResult> = {
  name: 'di',
  summary: 'Show the modules and providers of the backend, without constructing any provider.',
  usage: 'vibejs di [--module NAME] [--token NAME]',
  examples: ['vibejs di', 'vibejs di --token TodosService'],
  options: {
    module: { type: 'string', description: 'Only the module NAME, wherever it is imported.' },
    token: { type: 'string', description: 'Only the modules that provide or export NAME.' },
  },
  positionals: [],
  async run({ values }, ctx) {
    const base = { ok: true, command: 'di', version: ctx.version };
    const root = fullstackRoot(ctx.cwd, 'di');
    if (typeof root !== 'string')
      return { ...base, ok: false, error: envelopeError(root), modules: [] };
    let all: AppInspection['modules'];
    try {
      all = await withServerRunner(root, async (runner) => {
        const { server, AppModule, appOptions } = await loadAppModule(runner, root);
        return server.inspect(AppModule, appOptions).modules;
      });
    } catch (error) {
      return { ...base, ok: false, error: envelopeError(loadError(error)), modules: [] };
    }
    const name = str(values.module);
    const token = str(values.token);
    const modules = all.filter(
      (m) =>
        (name === undefined || m.path.split(' > ').at(-1) === name) &&
        (token === undefined || m.providers.includes(token) || m.exports.includes(token)),
    );
    return { ...base, next: modules.length ? undefined : ['vibejs di'], modules };
  },
  human: (r) =>
    r.modules.length
      ? r.modules
          .map((m) =>
            [
              `${m.path}${m.global ? ' (global)' : ''}`,
              `  providers: ${list(m.providers)}`,
              `  exports: ${list(m.exports)}`,
              `  imports: ${list(m.imports)}`,
            ].join('\n'),
          )
          .join('\n\n')
      : 'No module matches.',
};
