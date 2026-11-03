/**
 * `pnpm --filter @mermaid-js/dev serve`: the Playwright web server, on MERMAID_PORT (default
 * 9000; `playwright.config.ts` sets it). `pnpm dev` is the same server with v12's port rule.
 * It watches too, for the live-reload specs, and serves the Dev Explorer (`/dev/`) over
 * `MERMAID_DEV_EXPLORER_ROOT` (default `e2e/diagrams`). `MERMAID_PORT=0` picks a free port.
 */
import { explorerServerOptions, resolveExplorerRoot } from '../explorer.ts';
import { startServer } from '../server.ts';

const port = Number(process.env.MERMAID_PORT ?? 9000);
const server = await startServer(port, explorerServerOptions(resolveExplorerRoot(process.env)));
process.stdout.write(`e2e pages at ${server.url}/e2e.html\n`);
