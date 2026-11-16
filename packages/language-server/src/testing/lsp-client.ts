/**
 * A scripted LSP client for the specs (D99 suite 5): spawns `mermaid-language-server --stdio`
 * from source (node + tsx, the `mermaid-source` condition), or a built bin such as the one npm
 * installs, and talks JSON-RPC over its stdio.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver-protocol/node';
import type {
  ClientCapabilities,
  InitializeResult,
  LogMessageParams,
  ProtocolConnection,
  PublishDiagnosticsParams,
  TextDocumentContentChangeEvent,
} from 'vscode-languageserver-protocol';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const CLI = join(import.meta.dirname, '..', 'cli.ts');
/** tsx's loader by URL, so the server starts from any working directory. */
const TSX = pathToFileURL(createRequire(join(ROOT, 'package.json')).resolve('tsx')).href;
/**
 * Which bin to run: the source through tsx, or a built one, such as the installed
 * `node_modules/.bin/mermaid-language-server` of the pack smoke spec
 * (`e2e/platform/language-server.spec.ts`), run as it is, through its shebang, as an editor
 * runs it.
 */
export type Bin = 'source' | { readonly path: string };

/** The executable and its arguments for `bin`. */
function command(bin: Bin, args: readonly string[]): [string, string[]] {
  if (typeof bin === 'object') return [bin.path, [...args]];
  return [process.execPath, ['--import', TSX, '--conditions=mermaid-source', CLI, ...args]];
}

export interface Client {
  readonly connection: ProtocolConnection;
  readonly init: InitializeResult;
  /** Every `window/logMessage` the server sent, in order. */
  readonly logs: LogMessageParams[];
  /** Every `publishDiagnostics` the server sent, in order. */
  readonly published: PublishDiagnosticsParams[];
  /** The next `publishDiagnostics` for `uri` (one already received and not yet taken first). */
  diagnostics(uri: string): Promise<PublishDiagnosticsParams>;
  /** Open `uri` with `text` (version 1, language id `mermaid` unless given). */
  open(uri: string, text: string, languageId?: string): void;
  /** Replace the whole text of `uri`. */
  change(uri: string, text: string, version: number): void;
  /** Send `changes` (ranged or full) for `uri` in one `didChange`, applied in order. */
  edit(uri: string, version: number, changes: TextDocumentContentChangeEvent[]): void;
  close(uri: string): void;
  /** `shutdown` + `exit`; resolves with the server's exit code. */
  stop(): Promise<number | null>;
  /** Close the server's stdin without `exit` (as a client that goes away does). */
  endInput(): void;
  /** Resolves with the server's exit code once its process has exited. */
  readonly exited: Promise<number | null>;
  /** What the server wrote to stderr. */
  stderr(): string;
}

export interface ClientOptions {
  rootUri?: string | null;
  workspaceFolders?: { uri: string; name: string }[];
  initializationOptions?: unknown;
  capabilities?: ClientCapabilities;
  /** The bin to start (default `source`). */
  bin?: Bin;
  /** Arguments for the bin (default `['--stdio']`). */
  args?: readonly string[];
  /** The server's working directory (default the repository root). */
  cwd?: string;
  /** The `processId` sent in `initialize` (default this process, which stays alive). */
  processId?: number | null;
}

/** What a run of the bin that is not an LSP session wrote, and its exit code. */
export interface CliRun {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the bin with `args` and stdin closed at once; resolves when it exits. */
export function runCli(args: readonly string[], bin: Bin = 'source'): Promise<CliRun> {
  const child = spawn(...command(bin, args), { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c));
  child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c));
  child.stdin.end();
  return new Promise((done) => child.on('close', (code) => done({ code, stdout, stderr })));
}

export async function startClient(options: ClientOptions = {}): Promise<Client> {
  const child = spawn(...command(options.bin ?? 'source', options.args ?? ['--stdio']), {
    cwd: options.cwd ?? ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c));
  const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)));
  const connection = createProtocolConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin)
  );
  const published: PublishDiagnosticsParams[] = [];
  const logs: LogMessageParams[] = [];
  connection.onNotification('window/logMessage', (p: LogMessageParams) => void logs.push(p));
  const unread: PublishDiagnosticsParams[] = [];
  const waiting: { uri: string; done: (p: PublishDiagnosticsParams) => void }[] = [];
  connection.onNotification('textDocument/publishDiagnostics', (p: PublishDiagnosticsParams) => {
    published.push(p);
    const w = waiting.findIndex((x) => x.uri === p.uri);
    if (w >= 0) waiting.splice(w, 1)[0]!.done(p);
    else unread.push(p);
  });
  connection.listen();
  // A server that dies before answering fails the spec with its stderr, not a timeout.
  const init = await Promise.race([
    connection.sendRequest<InitializeResult>('initialize', {
      processId: options.processId === undefined ? process.pid : options.processId,
      rootUri: options.rootUri ?? null,
      capabilities: options.capabilities ?? {},
      ...(options.workspaceFolders ? { workspaceFolders: options.workspaceFolders } : {}),
      ...(options.initializationOptions !== undefined
        ? { initializationOptions: options.initializationOptions }
        : {}),
    }),
    exited.then((code) => {
      throw new Error(`the server exited (${code}) before initialize:\n${stderr}`);
    }),
  ]);
  await connection.sendNotification('initialized', {});
  return {
    connection,
    init,
    logs,
    published,
    diagnostics(uri) {
      const i = unread.findIndex((x) => x.uri === uri);
      if (i >= 0) return Promise.resolve(unread.splice(i, 1)[0]!);
      return new Promise((done) => waiting.push({ uri, done }));
    },
    open(uri, text, languageId = 'mermaid') {
      void connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text },
      });
    },
    change(uri, text, version) {
      void connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    },
    edit(uri, version, contentChanges) {
      void connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges,
      });
    },
    close(uri) {
      void connection.sendNotification('textDocument/didClose', { textDocument: { uri } });
    },
    async stop() {
      await connection.sendRequest('shutdown');
      await connection.sendNotification('exit');
      const code = await exited;
      connection.dispose();
      return code;
    },
    endInput() {
      child.stdin.end();
    },
    exited,
    stderr: () => stderr,
  };
}

/** Decode `semanticTokens/full` data into absolute `{ line, char, length, type, modifiers }`. */
export function decodeTokens(
  data: readonly number[],
  legend: { tokenTypes: readonly string[]; tokenModifiers: readonly string[] }
): { line: number; char: number; length: number; type: string; modifiers: string[] }[] {
  const out = [];
  let line = 0;
  let char = 0;
  for (let i = 0; i + 5 <= data.length; i += 5) {
    const [dl, dc, length, type, mods] = data.slice(i, i + 5) as [
      number,
      number,
      number,
      number,
      number,
    ];
    line += dl;
    char = dl === 0 ? char + dc : dc;
    out.push({
      line,
      char,
      length,
      type: legend.tokenTypes[type] ?? `?${type}`,
      modifiers: legend.tokenModifiers.filter((_, bit) => mods & (1 << bit)),
    });
  }
  return out;
}
