/**
 * `pnpm dev`: runs the dev server (`dev-server.ts`) in a child process and restarts it when the
 * server's own code changes (`packages/dev/src` outside `browser/`; see `../supervise.ts`).
 * Browser code and the other packages rebuild live inside the running server.
 */
import { join } from 'node:path';
import { REPO_ROOT } from '../fixtures.ts';
import { spawnServer, superviseServer, watchServerSources } from '../supervise.ts';

const supervisor = superviseServer({
  start: () => spawnServer(join(import.meta.dirname, 'dev-server.ts')),
  watch: (onChange) => watchServerSources(REPO_ROOT, onChange),
  note: (text) => process.stdout.write(`${text}\n`),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void supervisor.close().then(() => process.exit(0));
  });
}
