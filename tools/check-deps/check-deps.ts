/**
 * Published-package dependency check (R-PERF-2, R-PARSE-1).
 *
 * - `core` and every `diagram-*` package declare no runtime (`dependencies`,
 *   `optionalDependencies`) dependencies at all; they reach core as a peer.
 * - Other published packages (`mermaid`, `plugin-*`) depend only on workspace packages.
 * - Peer dependencies of published packages are workspace packages only.
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
}

export interface WorkspacePackage {
  /** Directory relative to the workspace root, e.g. `packages/core`. */
  dir: string;
  manifest: Manifest;
}

const isZeroDependencyPackage = (dir: string) => {
  const name = basename(dir);
  return name === 'core' || name.startsWith('diagram-');
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
          `${manifest.name}: runtime dependency "${dep}" is not allowed (core and diagram packages have zero runtime dependencies)`
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
