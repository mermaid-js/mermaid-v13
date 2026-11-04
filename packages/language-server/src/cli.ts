#!/usr/bin/env node
/**
 * The `mermaid-language-server` bin (R-LANG-2, D98): the Mermaid language server over stdio.
 * `--stdio` is accepted (editors pass it) and is the only transport.
 */
import {
  createConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver/node';
import { startServer } from './server.ts';

startServer(
  createConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout))
);
