/**
 * `pnpm dev`: the dev server. Port by v12's rule (`resolveDevPort`: `MERMAID_DEV_PORT`, else
 * 9000 for an `alana-mermaid` checkout, else 9000 + sha1(root) % 100), after loading `.env`
 * from the checkout root. Listens on all interfaces and prints every address it answers on.
 * Watches the workspace sources and the explorer root (`MERMAID_DEV_EXPLORER_ROOT`, default
 * `e2e/diagrams`): a change rebuilds and reloads open pages (`/events`). The Dev Explorer is at
 * `/dev/`, the e2e page at `/e2e.html`.
 */
import { join } from 'node:path';
import { config } from 'dotenv';
import { REPO_ROOT } from '../fixtures.ts';
import { explorerServerOptions, resolveExplorerRoot } from '../explorer.ts';
import { resolveDevPort } from '../listen.ts';
import { startServer } from '../server.ts';

config({ path: join(REPO_ROOT, '.env'), quiet: true });

const explorer = explorerServerOptions(resolveExplorerRoot(process.env));
const server = await startServer(resolveDevPort(process.env, REPO_ROOT), explorer);
process.stdout.write(
  [
    '',
    `mermaid dev server (checkout: ${REPO_ROOT}), listening on:`,
    ...server.urls.map((url) => `  ${url}dev/`),
    '',
  ].join('\n')
);
