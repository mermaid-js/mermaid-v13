/**
 * Finds the plugin config fragments in the workspace (D153): each package's
 * `schema/config.fragment.yaml`, in package-path order.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FRAGMENT_SCHEMA, type FragmentSource } from './generate.ts';

export function findFragments(root: string): FragmentSource[] {
  const out: FragmentSource[] = [];
  for (const dir of readdirSync(join(root, 'packages')).sort()) {
    const pkg = `packages/${dir}`;
    const file = join(root, pkg, FRAGMENT_SCHEMA);
    if (existsSync(file)) out.push({ pkg, source: readFileSync(file, 'utf8') });
  }
  return out;
}

/** Where the per-diagram MIGRATION.md sections live, one file each (`<order>-<slug>.md`, `<type>.md`). */
export const MIGRATION_FRAGMENTS = 'v13/docs/migration';

/** One per-diagram MIGRATION.md section: its file name and text. */
export interface MigrationFragment {
  readonly name: string;
  readonly text: string;
}

/**
 * The per-diagram MIGRATION.md sections, in file-name order: the numbered ones keep the order the
 * sections had before they were split out (`010-…` to `360-…`), and a port's `<type>.md` sorts
 * after them, alphabetically, so two ports adding one each never touch the same file.
 */
export function findMigrationFragments(root: string): MigrationFragment[] {
  const dir = join(root, MIGRATION_FRAGMENTS);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}
