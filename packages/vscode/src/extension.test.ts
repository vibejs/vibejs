import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from '../test/vscode-fake.ts';
import { activate } from './extension.ts';

vi.mock('vscode', () => import('../test/vscode-fake.ts'));

const TS_ID = 'TypeScriptTeam.native-preview';
const hint = (code: 'VIBE6101' | 'VIBE6102', message: string) => `[${code}] ${message}`;

function setup(pick?: string) {
  const disposable = { dispose: vi.fn<() => void>() };
  const registerContentMappers = vi.fn<(id: string, contributions: unknown[]) => typeof disposable>(
    () => disposable,
  );
  const ts = { activate: vi.fn<() => Promise<unknown>>(async () => ({ registerContentMappers })) };
  vscode.extensions.getExtension.mockImplementation((id: string) =>
    id === TS_ID ? ts : undefined,
  );
  vscode.window.showInformationMessage.mockResolvedValue(pick);
  vscode.window.showWarningMessage.mockResolvedValue(undefined);
  vscode.commands.executeCommand.mockResolvedValue(undefined);
  const context = { subscriptions: [] as { dispose(): unknown }[] };
  return { context, disposable, registerContentMappers, ts };
}

beforeEach(() => {
  vi.resetAllMocks();
  vscode.workspace.isTrusted = true;
});

describe('activate in an untrusted workspace', () => {
  beforeEach(() => {
    vscode.workspace.isTrusted = false;
  });

  it('shows VIBE6102 with the trust action and registers nothing', async () => {
    const { context, registerContentMappers } = setup();
    await activate(context);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledExactlyOnceWith(
      hint('VIBE6102', 'Trust this workspace to type-check .vibe files.'),
      'Manage Workspace Trust',
    );
    expect(vscode.extensions.getExtension).not.toHaveBeenCalled();
    expect(registerContentMappers).not.toHaveBeenCalled();
    expect(context.subscriptions).toEqual([]);
  });

  it('opens workspace trust when the action is picked', async () => {
    const { context } = setup('Manage Workspace Trust');
    await activate(context);
    await vi.waitFor(() => {
      expect(vscode.commands.executeCommand).toHaveBeenCalledExactlyOnceWith(
        'workbench.trust.manage',
      );
    });
  });

  it('runs nothing when the message is dismissed', async () => {
    const { context } = setup(undefined);
    await activate(context);
    await new Promise((resolve) => setTimeout(resolve));
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

describe('activate in a trusted workspace', () => {
  it('shows VIBE6101 naming the TS 7 extension when it is missing', async () => {
    const { context } = setup();
    vscode.extensions.getExtension.mockReturnValue(undefined);
    await activate(context);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledExactlyOnceWith(
      hint('VIBE6101', `Install the ${TS_ID} extension to type-check .vibe files.`),
    );
    expect(vscode.extensions.getExtension).toHaveBeenCalledWith(TS_ID);
    expect(context.subscriptions).toEqual([]);
  });

  it('registers .vibe with the TS 7 extension and disposes the registration', async () => {
    const { context, disposable, registerContentMappers, ts } = setup();
    await activate(context);
    expect(ts.activate).toHaveBeenCalledOnce();
    expect(registerContentMappers).toHaveBeenCalledExactlyOnceWith('vibejs.vibejs', [
      { extensions: ['.vibe'] },
    ]);
    expect(context.subscriptions).toEqual([disposable]);
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    for (const subscription of context.subscriptions) subscription.dispose();
    expect(disposable.dispose).toHaveBeenCalledOnce();
  });
});
