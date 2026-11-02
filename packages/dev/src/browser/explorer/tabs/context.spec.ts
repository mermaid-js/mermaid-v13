/**
 * The tab contract (`context.ts`): tabs act only through `ctx`, so no tab imports the file
 * API (`../api.ts`) or another tab.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TABS = import.meta.dirname;
const tabFiles = readdirSync(TABS).filter(
  (name) => name.endsWith('.ts') && !name.includes('.spec.')
);

const imports = (file: string): string[] =>
  [...readFileSync(join(TABS, file), 'utf8').matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map(
    (m) => m[1]!
  );

describe('the tab contract', () => {
  it.each(tabFiles)('%s does not import the file API', (file) => {
    expect(imports(file)).not.toContain('../api.ts');
  });
});
