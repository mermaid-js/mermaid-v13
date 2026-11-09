/**
 * The first-party diagram packages, found from their manifests. A port adds
 * `packages/diagram-<type>/` and every shared tool finds it here, so no shared list names it.
 *
 * A package is a diagram package when its package.json has a `mermaid` manifest with
 * `plugin: 'diagram'` (DESIGN §12.1). Its optional `workspace.yaml` holds what the shared
 * tools need from it beyond the manifest: config defaults, grammar targets, licence credits,
 * its release-table row. That file is not published (it is not in the package's `files`).
 * The keys are documented on {@link DiagramWiring}; a key a tool does not know is an error,
 * so a typo cannot silently drop a package from a table.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

/** The workspace root. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A diagram package's own `workspace.yaml`, the shared tools' per-package inputs. */
export interface DiagramWiring {
  /**
   * What the theme specs need from the package (`tools/gen-config/src/theme-packages.ts`):
   * names its sources build at run time (`dynamicReads`), `notDrawnYet` while it reads no
   * variable, core rows it is listed on before it reads them (`listedAhead`), and table rows
   * that may resolve to `currentColor` (`someThemes`, `authorOnly`).
   */
  readonly theme?: {
    readonly dynamicReads?: readonly string[];
    readonly notDrawnYet?: boolean;
    readonly listedAhead?: readonly string[];
    readonly someThemes?: readonly string[];
    readonly authorOnly?: readonly string[];
  };
  /**
   * `tools/gen-config` writes the package's config section defaults to
   * `src/generated/config-defaults.ts` (the section is the manifest's `section`, else its `id`).
   */
  readonly configDefaults?: boolean;
  /** The package's row in `v13/docs/RELEASING.md`: what it is, and when a consumer installs it. */
  readonly release?: { readonly summary: string; readonly install: string };
  /** Grammar targets for `tools/gen-grammar`, one per grammar file of the package. */
  readonly grammars?: readonly Readonly<Record<string, unknown>>[];
  /** Licence credits for `tools/release/src/licenses.ts` (R-REL-4). */
  readonly credits?: {
    /** Upstreams this package's ported files are derived from, by their licences.ts shape. */
    readonly upstreams?: readonly Readonly<Record<string, unknown>>[];
    /** Package-relative files that must credit the named upstreams. */
    readonly files?: Readonly<Record<string, readonly string[]>>;
  };
  /**
   * For `packages/bench/src/language-bundle.spec.ts` (R-LANG-8): the `src/` entries (`render/`,
   * `plugin.ts`) the package's `./language` bundle must not reach.
   */
  readonly languageBundle?: { readonly renderer: readonly string[] };
}

const WIRING_KEYS: ReadonlySet<string> = new Set([
  'configDefaults',
  'release',
  'grammars',
  'credits',
  'languageBundle',
  'theme',
]);

/** The `mermaid` key of a diagram package's package.json (DESIGN §12.1). */
export interface DiagramManifestShape {
  readonly plugin: 'diagram';
  readonly id: string;
  readonly types: readonly string[];
  readonly section?: string;
  readonly [key: string]: unknown;
}

export interface DiagramPackage {
  /** Workspace-relative directory, `packages/diagram-<type>`. */
  readonly dir: string;
  /** The directory name without `diagram-`: the name the theme and conformance tools use. */
  readonly type: string;
  /** The npm package name, `@mermaid-js/diagram-<type>`. */
  readonly name: string;
  /** package.json's `description`. */
  readonly description?: string;
  readonly private: boolean;
  readonly manifest: DiagramManifestShape;
  readonly wiring: DiagramWiring;
}

export const WIRING_FILE = 'workspace.yaml';

/** The `workspace.yaml` of the package at `dir` (absolute, or relative to `root`), or `{}`. */
export function readWiring(root: string, dir = ''): DiagramWiring {
  const path = join(root, dir, WIRING_FILE);
  if (!existsSync(path)) return {};
  const parsed = load(readFileSync(path, 'utf8')) ?? {};
  if (typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${dir}/${WIRING_FILE}: must be a mapping`);
  for (const key of Object.keys(parsed))
    if (!WIRING_KEYS.has(key)) throw new Error(`${dir}/${WIRING_FILE}: unknown key "${key}"`);
  return parsed as DiagramWiring;
}

/** Every first-party diagram package, in directory order. */
export function diagramPackages(root = ROOT): DiagramPackage[] {
  const out: DiagramPackage[] = [];
  for (const entry of readdirSync(join(root, 'packages')).sort()) {
    const dir = `packages/${entry}`;
    const path = join(root, dir, 'package.json');
    if (!entry.startsWith('diagram-') || !existsSync(path)) continue;
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
      name: string;
      description?: string;
      private?: boolean;
      mermaid?: DiagramManifestShape;
    };
    if (pkg.mermaid?.plugin !== 'diagram') continue;
    out.push({
      dir,
      type: entry.slice('diagram-'.length),
      name: pkg.name,
      ...(pkg.description !== undefined && { description: pkg.description }),
      private: pkg.private === true,
      manifest: pkg.mermaid,
      wiring: readWiring(root, dir),
    });
  }
  return out;
}
