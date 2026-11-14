#!/usr/bin/env node
/**
 * The `mermaid-language-server` bin (R-LANG-2, D98): the Mermaid language server over stdio.
 * `--stdio` is accepted (editors pass it) and is the only transport: `--node-ipc`, `--socket`
 * and `--pipe` are refused with an error, so a client configured for them fails at once
 * instead of waiting. Other flags are ignored (clients pass `--clientProcessId=…`). stdout
 * carries LSP messages only; `console` output goes to stderr.
 *
 * The server stops with its client: when stdin ends it exits, with code 0 after `shutdown`
 * and 1 otherwise (the raw streams go to `createConnection`, which installs those handlers).
 *
 * Third-party diagram facets are off by default (D157). A client turns them on with the
 * initialization option `{ "mermaid": { "plugins": true } }`; the server then scans each
 * workspace folder's own `node_modules` for `mermaid` manifests with a `language` entry.
 */
import './stdio-console.ts';
import { createConnection } from 'vscode-languageserver/node';
import { startServer } from './server.ts';
import { VERSION } from './version.ts';

const USAGE = [
  'Usage: mermaid-language-server [--stdio]',
  '       mermaid-language-server --version | --help',
  '',
  'The Mermaid language server over stdio, for .mmd and .mermaid files.',
  'Third-party diagram facets load only with the initialization option',
  '{ "mermaid": { "plugins": true } } (scans each workspace folder\'s node_modules).',
  '',
].join('\n');

/** The transports `vscode-languageserver` would pick from argv; this server has stdio only. */
const OTHER_TRANSPORT = /^--(node-ipc|socket|pipe)(=|$)/;

const args = process.argv.slice(2);
const refused = args.find((a) => OTHER_TRANSPORT.test(a));
if (args.includes('--version')) {
  process.stdout.write(`${VERSION}\n`);
} else if (args.includes('--help')) {
  process.stdout.write(USAGE);
} else if (refused) {
  process.stderr.write(
    `mermaid-language-server: only stdio is supported (got ${refused}); start it with --stdio\n`
  );
  process.exitCode = 2;
} else {
  startServer(createConnection(process.stdin, process.stdout));
}
