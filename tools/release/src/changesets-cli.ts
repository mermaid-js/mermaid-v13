/** `pnpm release:ensure-changeset [sha]`: see changesets.ts. `sha` defaults to GITHUB_SHA. */
import { join } from 'node:path';
import { ensureChangeset } from './changesets.ts';

const sha = process.argv[2] ?? process.env.GITHUB_SHA;
if (!sha) {
  process.stderr.write('release:ensure-changeset needs a commit sha (argument or GITHUB_SHA)\n');
  process.exit(2);
}
const id = ensureChangeset(join(import.meta.dirname, '..', '..', '..'), sha);
process.stdout.write(
  id === undefined ? 'Pending changesets found.\n' : `Added .changeset/${id}.md\n`
);
