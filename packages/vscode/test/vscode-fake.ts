// The parts of the `vscode` module that src/extension.ts uses. Tests replace `vscode` with this
// module through vi.mock and set its state per test.
import { vi } from 'vitest';

export const workspace = { isTrusted: true };
export const extensions = { getExtension: vi.fn<(id: string) => unknown>() };
export const window = {
  showInformationMessage: vi.fn<(message: string, ...items: string[]) => Promise<unknown>>(),
  showWarningMessage: vi.fn<(message: string) => Promise<unknown>>(),
};
export const commands = { executeCommand: vi.fn<(command: string) => Promise<unknown>>() };
