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
