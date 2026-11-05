import { join } from 'node:path';
import {
  findBinImportViolations,
  findDependencyViolations,
  findOptionalNameViolations,
  readBinSources,
  readCoreSources,
  readWorkspace,
} from './check-deps.ts';

const root = join(import.meta.dirname, '..', '..');
const packages = readWorkspace(root);
const violations = [
  ...findDependencyViolations(packages),
  ...findBinImportViolations(packages, readBinSources(root, packages)),
  ...findOptionalNameViolations(packages, readCoreSources(root, packages)),
];
if (violations.length > 0) {
  process.stderr.write(
    `Dependency check failed:\n${violations.map((v) => `  - ${v}`).join('\n')}\n`
  );
  process.exit(1);
}
process.stdout.write(
  'Dependency check passed: published packages have no third-party runtime dependencies (beyond D88, D171), and core names no optional package (R-PLUG-8).\n'
);
