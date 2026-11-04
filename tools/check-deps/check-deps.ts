/**
 * Published-package dependency check (R-PERF-2, R-PARSE-1).
 *
 * - `core`, every `diagram-*` package and `language-service` (R-LANG-1) declare no runtime
 *   (`dependencies`, `optionalDependencies`) dependencies at all; they reach core as a peer.
 * - Other published packages (`mermaid`, `plugin-*`) depend only on workspace packages.
 * - Peer dependencies of published packages are workspace packages only.
 * - A published package's `bin` sources import only `node:` builtins, relative files and
 *   workspace packages, so the CLI ships with no third-party code (R-PERF-2, D85).
 * - Private packages (conformance, bench, tools) are not published and are skipped.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export interface Manifest {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
}

export interface WorkspacePackage {
  /** Directory relative to the workspace root, e.g. `packages/core`. */
  dir: string;
  manifest: Manifest;
}

const isZeroDependencyPackage = (dir: string) => {
  const name = basename(dir);
  return name === 'core' || name === 'language-service' || name.startsWith('diagram-');
};

export function findDependencyViolations(packages: WorkspacePackage[]): string[] {
  const workspaceNames = new Set(packages.map((p) => p.manifest.name));
  const violations: string[] = [];
  for (const { dir, manifest } of packages) {
    if (manifest.private) {
      continue;
    }
    const runtime = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ];
    for (const dep of runtime) {
      if (isZeroDependencyPackage(dir)) {
        violations.push(
          `${manifest.name}: runtime dependency "${dep}" is not allowed (core, diagram and language-service packages have zero runtime dependencies)`
        );
      } else if (!workspaceNames.has(dep)) {
        violations.push(`${manifest.name}: runtime dependency "${dep}" is not a workspace package`);
      }
    }
    for (const dep of Object.keys(manifest.peerDependencies ?? {})) {
      if (!workspaceNames.has(dep)) {
        violations.push(`${manifest.name}: peer dependency "${dep}" is not a workspace package`);
      }
    }
  }
  return violations;
}

/** Every package directly under `packages/` that has a package.json. */
export function readWorkspace(root: string): WorkspacePackage[] {
  return readdirSync(join(root, 'packages'))
    .map((name) => join('packages', name))
    .filter((dir) => existsSync(join(root, dir, 'package.json')))
    .map((dir) => ({
      dir,
      manifest: JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as Manifest,
    }));
}

export interface BinSource {
  pkg: WorkspacePackage;
  /** Source path relative to the package, e.g. `src/cli.ts`. */
  file: string;
  text: string;
}

// `import … from 'x'`, `export … from 'x'`, `import 'x'` and `import('x')`.
const SPECIFIER = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** Imports of bin sources that are neither `node:` builtins, relative, nor workspace packages. */
export function findBinImportViolations(
  packages: WorkspacePackage[],
  sources: BinSource[]
): string[] {
  const workspaceNames = [...new Set(packages.map((p) => p.manifest.name))];
  const allowed = (spec: string) =>
    spec.startsWith('node:') ||
    spec.startsWith('.') ||
    workspaceNames.some((name) => spec === name || spec.startsWith(`${name}/`));
  return sources.flatMap(({ pkg, file, text }) =>
    [...text.matchAll(SPECIFIER)]
      .map((m) => m[1] ?? '')
      .filter((spec) => !allowed(spec))
      .map(
        (spec) =>
          `${pkg.manifest.name}: bin ${file} imports "${spec}" (bins use node: builtins and workspace packages only)`
      )
  );
}

/** The TypeScript source of each published bin: `./dist/x.js` is built from `src/x.ts`. */
export function readBinSources(root: string, packages: WorkspacePackage[]): BinSource[] {
  return packages
    .filter((pkg) => !pkg.manifest.private && pkg.manifest.bin !== undefined)
    .flatMap((pkg) => {
      const { bin } = pkg.manifest;
      const targets = typeof bin === 'string' ? [bin] : Object.values(bin ?? {});
      return targets.map((target) => {
        const file = target.replace(/^(\.\/)?dist\//, 'src/').replace(/\.js$/, '.ts');
        return { pkg, file, text: readFileSync(join(root, pkg.dir, file), 'utf8') };
      });
    });
}
