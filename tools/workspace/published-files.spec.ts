import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, workspaceDiagrams } from './diagrams.ts';
import {
  builtSources,
  DIAGRAM_BUILD_CONFIG,
  publishedSources,
  TEST_SUBPATH,
  TEST_SUPPORT,
} from './published-files.ts';

/** The packages the diagrams publish: each diagram package and `@mermaid-js/shared`. */
const PACKAGES = [...workspaceDiagrams().map((d) => d.dir), 'packages/shared'];

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, unknown>;

describe('test support stays out of the published packages (#816)', () => {
  it.each(workspaceDiagrams().map((d) => d.dir))(
    '%s builds with the one diagram build config',
    (dir) => {
      expect(readJson(`${dir}/tsconfig.build.json`)).toEqual(DIAGRAM_BUILD_CONFIG);
    }
  );

  it.each(PACKAGES)('%s publishes dist only', (dir) => {
    const files = readJson(`${dir}/package.json`).files as string[];
    expect(files.filter((f) => f !== 'THIRD_PARTY_NOTICES')).toEqual(['dist']);
  });

  it.each(PACKAGES)('%s compiles exactly what its published entries reach', (dir) => {
    const built = [...builtSources(join(ROOT, dir))].sort();
    expect(built.filter((f) => TEST_SUPPORT.test(f))).toEqual([]);
    expect(built).toEqual([...publishedSources(join(ROOT, dir))].sort());
  });

  it.each(PACKAGES)('%s resolves its test subpaths from the workspace only', (dir) => {
    const exports = readJson(`${dir}/package.json`).exports as Record<string, object>;
    for (const [key, value] of Object.entries(exports))
      if (TEST_SUBPATH.test(key)) expect(Object.keys(value), key).toEqual(['mermaid-source']);
  });
});
