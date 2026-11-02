/** `pnpm check:licenses`: fails when ported code (Pele, sanitize-url) lacks its MIT attribution (R-REL-4). */
import { join } from 'node:path';
import { checkLicenses } from './licenses.ts';

const problems = checkLicenses(join(import.meta.dirname, '..', '..', '..'));
if (problems.length > 0) {
  process.stderr.write(`License check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  'License check passed: ported files carry their upstream MIT headers and are listed in THIRD_PARTY_NOTICES.\n'
);
