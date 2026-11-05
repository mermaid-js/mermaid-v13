/**
 * The package.json that goes into a published tarball (R-REL-2, R-REL-3).
 *
 * `pnpm pack` already turns `workspace:` ranges into concrete ones. On top of that:
 * - the `mermaid-source` export condition is dropped: it points at `src/`, which is not shipped
 *   (`danglingExports` refuses a subpath that had no other target);
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
 * The only dist-tag either registry gets from this pipeline (D155). Never `latest`. Not `alpha`
 * either: on npm that tag held v11 alphas, and it stays at 13.0.0-alpha.0.
 */
export const DIST_TAG = 'v13-alpha';

const SOURCE_CONDITION = 'mermaid-source';
const DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

/** `mermaid` → `@mermaid-chart/mermaid`, `@mermaid-js/core` → `@mermaid-chart/core`. */
export function privateName(name: string): string {
  return `${PRIVATE_SCOPE}/${name.replace(/^@[^/]+\//, '')}`;
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
  if (out.exports !== undefined) out.exports = stripSourceCondition(out.exports);
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
  const targets = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (value === null || typeof value !== 'object') return [];
    return Object.values(value).flatMap(targets);
  };
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
