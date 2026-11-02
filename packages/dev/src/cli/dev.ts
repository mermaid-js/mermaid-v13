/**
 * `pnpm dev`: the dev server. Port by v12's rule (`resolveDevPort`: `MERMAID_DEV_PORT`, else
 * 9000 for an `alana-mermaid` checkout, else 9000 + sha1(root) % 100), after loading `.env`
 * from the checkout root. Listens on all interfaces and prints every address it answers on.
 * Watches the workspace sources: a change rebuilds and reloads open pages (`/events`).
 */
import { join } from 'node:path';
import { config } from 'dotenv';
import { REPO_ROOT } from '../fixtures.ts';
import { resolveDevPort } from '../listen.ts';
import { startServer } from '../server.ts';

config({ path: join(REPO_ROOT, '.env'), quiet: true });

const server = await startServer(resolveDevPort(process.env, REPO_ROOT), { watch: true });
process.stdout.write(
  [
    '',
    `mermaid dev server (checkout: ${REPO_ROOT}), listening on:`,
    ...server.urls.map((url) => `  ${url}e2e.html`),
    '',
  ].join('\n')
);
