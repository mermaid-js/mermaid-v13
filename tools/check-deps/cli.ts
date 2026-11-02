import { join } from 'node:path';
import { findDependencyViolations, readWorkspace } from './check-deps.ts';

const root = join(import.meta.dirname, '..', '..');
const violations = findDependencyViolations(readWorkspace(root));
if (violations.length > 0) {
  process.stderr.write(
    `Dependency check failed:\n${violations.map((v) => `  - ${v}`).join('\n')}\n`
  );
  process.exit(1);
}
process.stdout.write(
  'Dependency check passed: published packages have no third-party runtime dependencies.\n'
);
