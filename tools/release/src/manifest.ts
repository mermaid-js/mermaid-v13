/**
 * The package.json that goes into a published tarball (R-REL-2, R-REL-3).
 *
 * `pnpm pack` already turns `workspace:` ranges into concrete ones. On top of that:
 * - the `mermaid-source` export condition is dropped: it points at `src/`, which is not shipped
 *   (`danglingExports` refuses a subpath that had no other target);
 * - in a diagram package or shared, a workspace-only test subpath is dropped whole: `./testing`
 *   or `./testing/…` with no target but `mermaid-source`. The specs and conformance import it
 *   from the workspace; its files are left out of the build, so it is not in the tarball (#816).
 *   `testSupportEntries` refuses a tarball that holds test support all the same (a stale `dist`);
 * - devDependencies are dropped: they name private workspace packages and mean nothing to users;
 * - for the private registry (GitHub Packages, scope `@mermaid-chart`, D28) every package is
 *   renamed into that scope and every workspace dependency becomes an npm alias
 *   (`"@mermaid-js/core": "npm:@mermaid-chart/core@^x"`), so the compiled `import`s of
 *   `@mermaid-js/*` resolve unchanged.
 * `workspaceLeaks` is the publish-fork "parser-leak gate": a `workspace:` range left in a
 * manifest makes the package uninstallable outside the monorepo.
 */

export type Target = 'private' | 'public';

export interface PackedManifest {
  name: string;
  version: string;
  exports?: unknown;
  repository?: unknown;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export const PRIVATE_SCOPE = '@mermaid-chart';
export const PRIVATE_REPOSITORY = 'https://github.com/Mermaid-Chart/mermaid-v13';
/**
 * The only dist-tag either registry gets from this pipeline (D159). Never `latest`. Not `alpha`
 * either: on npm that tag held v11 alphas, and it stays at 13.0.0-alpha.0.
 */
export const DIST_TAG = 'v13-alpha';

const SOURCE_CONDITION = 'mermaid-source';
const DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

/** `mermaid` → `@mermaid-chart/mermaid`, `@mermaid-js/core` → `@mermaid-chart/core`. */
export function privateName(name: string): string {
  return `${PRIVATE_SCOPE}/${name.replace(/^@[^/]+\//, '')}`;
}

/** `./testing`, `./testing/layout-invariants`: the subpath names test support may use. */
const TEST_SUBPATH = /^\.\/testing(?:\/|$)/;

/**
 * The packages whose test subpaths are workspace-only: the diagram packages (one build config,
 * `tools/workspace/published-files.ts`) and shared. Elsewhere a `./testing` is published on
 * purpose (language-service builds it), so a source-only one there is still a dangling export.
 */
const WORKSPACE_TESTING = /^@mermaid-js\/(?:diagram-[^/]+|shared)$/;

/** A test subpath whose only target is the source: the workspace resolves it, users never see it. */
function workspaceOnly([key, value]: [string, unknown]): boolean {
  if (!TEST_SUBPATH.test(key) || value === null || typeof value !== 'object') return false;
  const conditions = Object.keys(value);
  return conditions.length === 1 && conditions[0] === SOURCE_CONDITION;
}

function dropWorkspaceOnly(exports: unknown): unknown {
  if (exports === null || typeof exports !== 'object' || Array.isArray(exports)) return exports;
  return Object.fromEntries(Object.entries(exports).filter((entry) => !workspaceOnly(entry)));
}

/**
 * A compiled file only tests use: ported v12 spec adapters, `__tests__/` and `fixtures/`
 * folders, `*.fixtures`, `*.spec` and `*.test` modules, harnesses, test contexts, layout
 * invariants and `testing` entries.
 */
const TEST_SUPPORT_ENTRY = new RegExp(
  [
    String.raw`(?:^|/)(?:v12-specs|__tests__|fixtures|testing)/`,
    String.raw`(?:^|/)(?:harness|invariants|test-context|testing|fixtures)\.(?:d\.ts|[cm]?js)(?:\.map)?$`,
    String.raw`\.(?:fixtures|spec|test)\.(?:d\.ts|[cm]?js)(?:\.map)?$`,
  ].join('|')
);

/** Every path an export value names, under any condition. */
function targets(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(targets);
}

/** The folders of the test subpaths a manifest publishes on purpose (core's `./svg/testing`). */
function publishedTestDirs(manifest: PackedManifest): string[] {
  const exports = manifest.exports;
  if (exports === null || typeof exports !== 'object' || Array.isArray(exports)) return [];
  return Object.entries(exports)
    .filter(([key]) => /(?:^|\/)testing(?:\/|$)/.test(key))
    .flatMap(([, value]) => targets(value))
    .map((target) => target.replace(/^\.\//, '').replace(/[^/]*$/, ''));
}

/**
 * The entries of a tarball (paths relative to its `package/`) that are test support no published
 * subpath names: a stale `dist` from an older build, or a build that compiled a test file (#816).
 */
export function testSupportEntries(manifest: PackedManifest, entries: readonly string[]): string[] {
  const allowed = publishedTestDirs(manifest);
  return entries.filter(
    (entry) => TEST_SUPPORT_ENTRY.test(entry) && !allowed.some((dir) => entry.startsWith(dir))
  );
}

function stripSourceCondition(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSourceCondition);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== SOURCE_CONDITION)
      .map(([k, v]) => [k, stripSourceCondition(v)])
  );
}

export function publishManifest(
  packed: PackedManifest,
  opts: { target: Target; workspace: readonly string[] }
): PackedManifest {
  const out: PackedManifest = { ...packed };
  delete out.devDependencies;
  if (out.exports !== undefined) {
    const exports = WORKSPACE_TESTING.test(packed.name)
      ? dropWorkspaceOnly(out.exports)
      : out.exports;
    out.exports = stripSourceCondition(exports);
  }
  if (opts.target === 'public') return out;

  out.name = privateName(packed.name);
  out.repository = { type: 'git', url: PRIVATE_REPOSITORY };
  const workspace = new Set(opts.workspace);
  for (const field of DEP_FIELDS) {
    const deps = packed[field];
    if (deps === undefined) continue;
    out[field] = Object.fromEntries(
      Object.entries(deps).map(([dep, range]) => [
        dep,
        workspace.has(dep) ? `npm:${privateName(dep)}@${range}` : range,
      ])
    );
  }
  return out;
}

export function workspaceLeaks(manifest: PackedManifest): string[] {
  const leaks: string[] = [];
  for (const field of [...DEP_FIELDS, 'devDependencies'] as const)
    for (const [dep, range] of Object.entries(manifest[field] ?? {}))
      if (range.includes('workspace:')) leaks.push(`${field}: ${dep}@${range}`);
  return leaks;
}

/**
 * Export subpaths that are unusable once published: left with no target after the
 * `mermaid-source` condition is dropped (`"./monarch.json": {}`, #174), or still pointing into
 * `src/`, which is not shipped.
 */
export function danglingExports(manifest: PackedManifest): string[] {
  const exports = manifest.exports;
  if (exports === null || typeof exports !== 'object' || Array.isArray(exports)) return [];
  return Object.entries(exports)
    .filter(([key]) => key.startsWith('.'))
    .filter(([, value]) => {
      const all = targets(value);
      return all.length === 0 || all.some((t) => t.startsWith('./src/'));
    })
    .map(([key]) => key);
}

/**
 * Dependencies on the set's own packages must name its exact version: alphas break between
 * builds, and `^13.0.0-alpha.1` also matches `alpha.2`, so a user who pins `mermaid` exactly
 * would still float `@mermaid-js/core`. Use `workspace:*`, which `pnpm pack` writes as exact.
 */
export function inexactWorkspaceRanges(
  manifest: PackedManifest,
  versions: ReadonlyMap<string, string>
): string[] {
  const problems: string[] = [];
  for (const field of DEP_FIELDS)
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      const version = versions.get(dep);
      if (version !== undefined && range !== version)
        problems.push(`${field}: ${dep}@${range} (want exactly ${version})`);
    }
  return problems;
}

/** Only `x.y.z-alpha.N` goes out, so a release or beta line is never published from here. */
export function assertAlphaVersion(manifest: Pick<PackedManifest, 'name' | 'version'>): void {
  if (!/^\d+\.\d+\.\d+-alpha\.\d+$/.test(manifest.version))
    throw new Error(
      `${manifest.name}@${manifest.version} is not an alpha prerelease (x.y.z-alpha.N); refusing to publish`
    );
}
