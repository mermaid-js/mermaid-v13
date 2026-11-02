/** `pnpm --filter @mermaid-js/visual serve`: the Playwright web server (port MERMAID_PORT, default 9000). */
import { startServer } from '../server.ts';

const port = Number(process.env.MERMAID_PORT ?? 9000);
const server = await startServer(port);
process.stdout.write(`e2e pages at ${server.url}/e2e.html\n`);
