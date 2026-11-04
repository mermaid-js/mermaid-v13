/** `pnpm release:sync-version`: see version-file.ts. */
import { join } from 'node:path';
import { syncVersionFile } from './version-file.ts';

const { version, changed } = syncVersionFile(join(import.meta.dirname, '..', '..', '..'));
process.stdout.write(
  `${changed ? 'Wrote' : 'Already at'} packages/mermaid/src/version.ts ${version}\n`
);
