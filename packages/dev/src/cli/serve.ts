/**
 * `pnpm --filter @mermaid-js/dev serve`: the Playwright web server, on MERMAID_PORT (default
 * 9000; `playwright.config.ts` sets it). `pnpm dev` is the same server with v12's port rule.
 * It watches too, for the live-reload spec (`e2e/dev/reload.spec.ts`).
 */
import { startServer } from '../server.ts';

const port = Number(process.env.MERMAID_PORT ?? 9000);
const server = await startServer(port, { watch: true });
process.stdout.write(`e2e pages at ${server.url}/e2e.html\n`);
