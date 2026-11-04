/**
 * Keeps stdout for LSP messages only: every `console` method writes to stderr instead, so a
 * facet (or a dependency) that logs cannot corrupt the JSON-RPC stream. Imported first by the
 * bin, before anything that might log.
 */
import { Console } from 'node:console';

globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
