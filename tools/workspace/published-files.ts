/**
 * What `tsc -p tsconfig.build.json` writes to `dist` (a package's whole tarball, with its
 * package.json and docs), and what the package's published entries can reach, for
 * `published-files.spec.ts` (#816). Test support (harnesses, test contexts, layout invariants,
 * fixtures, v12 spec adapters) is reached only from specs and from the workspace-only `./testing`
 * subpaths, so it is in neither.
 *
 * Both sets follow relative imports only: a package reaches another package through its
 * `exports`, never through a path.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

/** `./testing`, `./testing/…`: subpaths for specs, dropped from the published manifest. */
export const TEST_SUBPATH = /^\.\/testing(?:\/|$)/;

/** A source file name that only test support carries. */
export const TEST_SUPPORT =
  /(?:^|\/)(?:v12-specs\/|testing[./]|test-context\.ts$|harness\.ts$|invariants\.ts$|fixtures\.ts$|[^/]*\.fixtures\.ts$|[^/]*\.spec\.ts$)/;

/**
 * The one `tsconfig.build.json` of every diagram package. The build starts from the top-level
 * modules of `src/` (the published entries and what they import), so a file only specs or
 * `./testing` reach is never compiled, wherever it sits.
 */
export const DIAGRAM_BUILD_CONFIG = {
  extends: './tsconfig.json',
  compilerOptions: {
    noEmit: false,
    declaration: true,
    outDir: 'dist',
    rootDir: 'src',
    customConditions: [],
  },
  include: ['src/*.ts'],
  exclude: ['src/*.spec.ts', 'src/*.fixtures.ts', 'src/testing.ts', 'src/test-context.ts'],
};

function resolveImport(from: string, specifier: string): string | undefined {
  const path = resolve(dirname(from), specifier);
  const candidates = [path, path.replace(/\.js$/, '.ts'), `${path}.ts`, join(path, 'index.ts')];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile());
}

/** Every file `entries` reach through relative imports, workspace-relative to `dir`. */
function closure(dir: string, entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
    for (const { fileName } of info.importedFiles) {
      if (!fileName.startsWith('.')) continue;
      const target = resolveImport(file, fileName);
      if (target !== undefined) stack.push(target);
    }
  }
  return new Set([...seen].map((f) => relative(dir, f)));
}

/** The sources `tsc -p tsconfig.build.json` compiles into `dist`. */
export function builtSources(dir: string): Set<string> {
  const path = join(dir, 'tsconfig.build.json');
  const config = ts.readConfigFile(path, (p) => readFileSync(p, 'utf8'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dir, undefined, path);
  return closure(dir, parsed.fileNames);
}

/** The sources a user can load: what the package's exports reach, its `./testing…` aside. */
export function publishedSources(dir: string): Set<string> {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports: Record<string, { 'mermaid-source'?: string }>;
  };
  const entries = Object.entries(pkg.exports)
    .filter(([key]) => !TEST_SUBPATH.test(key))
    .map(([, value]) => value['mermaid-source'])
    .filter((source): source is string => source?.endsWith('.ts') === true)
    .map((source) => join(dir, source));
  return closure(dir, entries);
}
