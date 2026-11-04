#!/usr/bin/env node
/**
 * The `mermaid-language-server` bin (R-LANG-2, D98): the Mermaid language server over stdio.
 * `--stdio` is accepted (editors pass it) and is the only transport. stdout carries LSP
 * messages only; `console` output goes to stderr.
 *
 * Third-party diagram facets are off by default (D157). A client turns them on with the
 * initialization option `{ "mermaid": { "plugins": true } }`; the server then scans each
 * workspace folder's own `node_modules` for `mermaid` manifests with a `language` entry.
 */
import './stdio-console.ts';
import {
  createConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver/node';
import { startServer } from './server.ts';

if (process.argv.includes('--help')) {
  process.stderr.write(
    [
      'Usage: mermaid-language-server [--stdio]',
      '',
      'The Mermaid language server over stdio, for .mmd and .mermaid files.',
      'Third-party diagram facets load only with the initialization option',
      '{ "mermaid": { "plugins": true } } (scans each workspace folder\'s node_modules).',
      '',
    ].join('\n')
  );
} else {
  startServer(
    createConnection(
      new StreamMessageReader(process.stdin),
      new StreamMessageWriter(process.stdout)
    )
  );
}
