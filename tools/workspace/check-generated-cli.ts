/**
 * The last step of `pnpm check:static`: fails when any step of `pnpm regen` would change a
 * tracked file, and names the step to run (`check-generated.ts`, #694).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkGenerated, report } from './check-generated.ts';
import { ROOT } from './diagrams.ts';

const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: { regen: string };
};
const failures = checkGenerated(scripts.regen);
if (failures.length > 0) {
  process.stderr.write(`\n${report(failures)}`);
  process.exitCode = 1;
}
