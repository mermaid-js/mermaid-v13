/**
 * Spec helper: a scratch copy of the inputs `sync.ts` reads, so a spec can add a package and see
 * what `pnpm regen` would write without touching the workspace.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WIRING_FILE, workspaceDiagrams } from './diagrams.ts';
import { DEPENDENCY_RULES, RELEASING } from './sync.ts';

/**
 * Copies from `from` to `to`: every dependency rule's package.json, every diagram package's
 * package.json, `workspace.yaml` and `notices/` (a pre-manifest package's too: its entries must
 * survive the copy), RELEASING.md, mermaid's own notices and gen-grammar's sources (gen-grammar
 * depends on the packages they import).
 */
export function copyWorkspaceInputs(from: string, to: string): void {
  const copy = (path: string) => {
    if (!existsSync(join(from, path))) return;
    mkdirSync(join(to, path, '..'), { recursive: true });
    cpSync(join(from, path), join(to, path), { recursive: true });
  };
  for (const rule of DEPENDENCY_RULES) copy(`${rule.pkg}/package.json`);
  for (const d of workspaceDiagrams(from)) {
    copy(`${d.dir}/package.json`);
    copy(`${d.dir}/${WIRING_FILE}`);
    copy(`${d.dir}/notices`);
  }
  copy(RELEASING);
  copy('packages/mermaid/notices');
  copy('tools/gen-grammar/src');
}
