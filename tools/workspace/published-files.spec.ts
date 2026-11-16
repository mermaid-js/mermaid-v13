import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, workspaceDiagrams } from './diagrams.ts';
import {
  builtPackageDirs,
  builtSources,
  DIAGRAM_BUILD_CONFIG,
  publishedSources,
  publishedTestDirs,
  TEST_SUBPATH,
  TEST_SUPPORT,
  testImports,
} from './published-files.ts';

/** The packages the diagrams publish: each diagram package and `@mermaid-js/shared`. */
const PACKAGES = [...workspaceDiagrams().map((d) => d.dir), 'packages/shared'];

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, unknown>;

/** The built files of `dir` that carry a test-support name, outside its published test subpaths. */
function testNamed(dir: string, built: Iterable<string>): string[] {
  const allowed = publishedTestDirs(dir);
  return [...built].filter((f) => TEST_SUPPORT.test(f) && !allowed.some((d) => f.startsWith(d)));
}

/** A scratch diagram package on the one build config, its sources given by path. */
function scratchPackage(sources: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'published-files-'));
  const files = {
    'package.json': JSON.stringify({
      name: '@mermaid-js/diagram-x',
      exports: { '.': { 'mermaid-source': './src/index.ts' } },
    }),
    'tsconfig.json': JSON.stringify({ include: ['src'] }),
    'tsconfig.build.json': JSON.stringify(DIAGRAM_BUILD_CONFIG),
    ...sources,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

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
    expect(built).toEqual([...publishedSources(join(ROOT, dir))].sort());
  });

  it.each(PACKAGES)('%s resolves its test subpaths from the workspace only', (dir) => {
    const exports = readJson(`${dir}/package.json`).exports as Record<string, object>;
    for (const [key, value] of Object.entries(exports))
      if (TEST_SUBPATH.test(key)) expect(Object.keys(value), key).toEqual(['mermaid-source']);
  });

  // Every published package, core and the plugins too. A test subpath a package publishes on
  // purpose, with a built target (core's `./svg/testing`), is allowed its test names.
  it.each(builtPackageDirs(ROOT))('%s compiles no test support, by name or by import', (dir) => {
    const built = builtSources(join(ROOT, dir));
    expect(testNamed(join(ROOT, dir), built)).toEqual([]);
    expect(testImports(join(ROOT, dir), built)).toEqual([]);
  });

  it('catches a test file a published barrel re-exports, whatever it is called', () => {
    const dir = scratchPackage({
      'src/index.ts': "export { layoutViolations } from './layout/index.ts';\n",
      'src/layout/index.ts': "export { layoutViolations } from './checks.ts';\n",
      // pie's `layout/invariants.ts`, copied under a name the pattern does not know
      'src/layout/checks.ts': [
        "import { nonFinite } from '@mermaid-js/shared/testing/layout-invariants';",
        'export const layoutViolations = (v: unknown): string[] => {',
        '  const out: string[] = [];',
        "  nonFinite(v, 'layout', out);",
        '  return out;',
        '};',
        '',
      ].join('\n'),
    });
    const built = builtSources(dir);
    expect([...built].sort()).toEqual([
      'src/index.ts',
      'src/layout/checks.ts',
      'src/layout/index.ts',
    ]);
    expect(testNamed(dir, built)).toEqual([]);
    expect(testImports(dir, built)).toEqual([
      'src/layout/checks.ts: @mermaid-js/shared/testing/layout-invariants',
    ]);
  });

  it('names test files by their folder too: __tests__/ and fixtures/', () => {
    for (const path of [
      'src/layout/swimlane/__tests__/graphs.ts',
      'src/fixtures/basic.ts',
      'src/layout/invariants.ts',
      'src/v12-specs/adapter.ts',
    ])
      expect(TEST_SUPPORT.test(path), path).toBe(true);
    for (const path of ['src/layout/index.ts', 'src/theme/vocabulary.ts', 'src/svg/route.ts'])
      expect(TEST_SUPPORT.test(path), path).toBe(false);
  });
});
