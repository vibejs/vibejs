import type { ExtensionAPI } from 'typescript/vscode';
import * as vscode from 'vscode';
import { vibeError } from './errors.gen.ts';

const TS_EXTENSION_IDS = ['TypeScriptTeam.native-preview']; // the single place to update if TS moves into VS Code

/** The `[VIBE####] message` line of a coded error, without its fixes and docs link. */
const hint = (error: Error): string => error.message.split('\n')[0];

/** Hands `.vibe` files to the TypeScript 7 extension, or explains why type checking cannot run. */
export async function activate(
  context: Pick<vscode.ExtensionContext, 'subscriptions'>,
): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    void vscode.window
      .showInformationMessage(hint(vibeError('VIBE6102')), 'Manage Workspace Trust')
      .then((pick) => pick && vscode.commands.executeCommand('workbench.trust.manage'));
    return;
  }
  const ts = TS_EXTENSION_IDS.map((id) => vscode.extensions.getExtension<ExtensionAPI>(id)).find(
    (extension) => extension !== undefined,
  );
  if (!ts) {
    void vscode.window.showWarningMessage(
      hint(vibeError('VIBE6101', { extension: TS_EXTENSION_IDS.join(', ') })),
    );
    return;
  }
  context.subscriptions.push(
    (await ts.activate()).registerContentMappers('vibejs.vibejs', [{ extensions: ['.vibe'] }]),
  );
}
