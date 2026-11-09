/**
 * `pnpm check:licenses`: fails when ported code (Pele, sanitize-url, Iconify, and the d3 packages
 * sankey re-implements) lacks its upstream's attribution under that upstream's license (R-REL-4).
 */
import { join } from 'node:path';
import { checkLicenses } from './licenses.ts';

const problems = checkLicenses(join(import.meta.dirname, '..', '..', '..'));
if (problems.length > 0) {
  process.stderr.write(`License check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(
  "License check passed: ported files credit their upstreams under each upstream's license and are listed in THIRD_PARTY_NOTICES.\n"
);
