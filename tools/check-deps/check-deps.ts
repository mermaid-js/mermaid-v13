/**
 * Published-package dependency check (R-PERF-2, R-PARSE-1).
 *
 * - `core`, every `diagram-*` package and `language-service` (R-LANG-1) declare no runtime
 *   (`dependencies`, `optionalDependencies`) dependencies at all; they reach core as a peer.
 * - Other published packages (`mermaid`, `plugin-*`) depend only on workspace packages.
 * - Peer dependencies of published packages are workspace packages only.
 * - A published package's `bin` sources import only `node:` builtins, relative files and
 *   workspace packages, so the CLI ships with no third-party code (R-PERF-2, D85).
 * - Editor adapters (`language-service-<editor>`, R-LANG-2) declare no runtime dependencies,
 *   published or not: the editor, the service and core are peers.
 * - Other private packages (conformance, bench, tools) are not published and are skipped.
 * - `THIRD_PARTY_ALLOWED` names the few third-party packages a published package may depend
 *   on and import from its bin, by decision: the LSP server's `vscode-languageserver` (D88) and
 *   the ELK layout package's `elkjs` (D171, licensed EPL-2.0 OR GPL-3.0-or-later; see the
 *   package's THIRD_PARTY_NOTICES).
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

/** Third-party runtime dependencies a published package may have, by package name. */
export const THIRD_PARTY_ALLOWED: Readonly<Record<string, readonly string[]>> = {
  '@mermaid-js/language-server': ['vscode-languageserver'],
  '@mermaid-js/layout-elk': ['elkjs'],
};

const allowedThirdParty = (name: string, dep: string) =>
  THIRD_PARTY_ALLOWED[name]?.some((d) => dep === d || dep.startsWith(`${d}/`)) ?? false;

const isZeroDependencyPackage = (dir: string) => {
  const name = basename(dir);
  return name === 'core' || name === 'language-service' || name.startsWith('diagram-');
};

const isEditorAdapter = (dir: string) => basename(dir).startsWith('language-service-');

export function findDependencyViolations(packages: WorkspacePackage[]): string[] {
  const workspaceNames = new Set(packages.map((p) => p.manifest.name));
  const violations: string[] = [];
  for (const { dir, manifest } of packages) {
    if (isEditorAdapter(dir)) {
      for (const dep of Object.keys({
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
      })) {
        violations.push(
          `${manifest.name}: runtime dependency "${dep}" is not allowed (editor adapters take their editor and the service as peers)`
        );
      }
      continue;
    }
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
      } else if (!workspaceNames.has(dep) && !allowedThirdParty(manifest.name, dep)) {
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
  const allowed = (spec: string, pkg: WorkspacePackage) =>
    spec.startsWith('node:') ||
    spec.startsWith('.') ||
    workspaceNames.some((name) => spec === name || spec.startsWith(`${name}/`)) ||
    allowedThirdParty(pkg.manifest.name, spec);
  return sources.flatMap(({ pkg, file, text }) =>
    [...text.matchAll(SPECIFIER)]
      .map((m) => m[1] ?? '')
      .filter((spec) => !allowed(spec, pkg))
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
