/** `pnpm check:licenses`: fails when ported Pele code lacks its MIT attribution (R-REL-4). */
import { join } from 'node:path';
import { checkLicenses } from './licenses.ts';

const problems = checkLicenses(join(import.meta.dirname, '..', '..', '..'));
if (problems.length > 0) {
  process.stderr.write(`License check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  'License check passed: Pele-derived files carry MIT headers and are listed in THIRD_PARTY_NOTICES.\n'
);
