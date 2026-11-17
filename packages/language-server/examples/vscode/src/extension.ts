/**
 * A minimal VS Code client for `@mermaid-js/language-server`, for maintainers to try the LSP
 * (not published). It starts the server over stdio for `mermaid` documents (`.mmd`,
 * `.mermaid`) and leaves every feature to `vscode-languageclient`: diagnostics, hover,
 * completion, folding, semantic tokens, definition, references and rename.
 *
 * The server is the workspace build (`packages/language-server/dist/cli.js`) when it exists,
 * else `mermaid-language-server` on `PATH`; `mermaidLsp.serverPath` overrides both. The
 * transport stays unset and `--stdio` is passed by hand: the server refuses IPC, pipe and
 * socket.
 */
import { existsSync } from 'node:fs';
import { commands, window, workspace, type ExtensionContext } from 'vscode';
import {
  LanguageClient,
  type Executable,
  type LanguageClientOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

interface Server {
  executable: Executable;
  /** What the error message names when the server does not start. */
  label: string;
}

/** The server: a `cli.js` run with VS Code's own Node, or the bin on `PATH`. */
function findServer(context: ExtensionContext): Server {
  const configured = workspace.getConfiguration('mermaidLsp').get<string>('serverPath', '');
  // The extension sits in packages/language-server/examples/vscode.
  const built = context.asAbsolutePath('../../dist/cli.js');
  const script = configured === '' ? (existsSync(built) ? built : undefined) : configured;
  if (script === undefined) {
    const command = 'mermaid-language-server';
    return { executable: { command, args: ['--stdio'] }, label: command };
  }
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  const executable = { command: process.execPath, args: [script, '--stdio'], options: { env } };
  return { executable, label: script };
}

function reportStartFailure(label: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  void window.showErrorMessage(
    `Mermaid LSP: could not start ${label} (${reason}). Build it with ` +
      '`pnpm --filter "@mermaid-js/language-server..." build`, or set mermaidLsp.serverPath.'
  );
}

async function start(context: ExtensionContext): Promise<void> {
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'mermaid' }],
    initializationOptions: {
      mermaid: { plugins: workspace.getConfiguration('mermaidLsp').get('plugins', false) },
    },
  };
  const { executable, label } = findServer(context);
  client = new LanguageClient('mermaidLsp', 'Mermaid LSP', executable, clientOptions);
  try {
    await client.start();
  } catch (error) {
    reportStartFailure(label, error);
  }
}

async function stop(): Promise<void> {
  const running = client;
  client = undefined;
  if (running?.isRunning()) {
    await running.stop();
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(
    commands.registerCommand('mermaidLsp.restart', async () => {
      await stop();
      await start(context);
    })
  );
  await start(context);
}

export function deactivate(): Promise<void> {
  return stop();
}
