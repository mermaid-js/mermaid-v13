/**
 * The first-party diagram registry (DESIGN §12.4): `packages/mermaid/src/generated/registry.gen.ts`,
 * written by `pnpm gen:registry` from the v12 detector table below and the `mermaid` manifests
 * in `packages/diagram-*\/package.json`. Detection order is part of "syntax is sacred", so the
 * table keeps v12's registration order and v12's regexes byte for byte, quirks included
 * (`c4` matches `C4Container` anywhere in the text). Types without a v13 package stay in the
 * table so they are recognised and rejected with `UNSUPPORTED_DIAGRAM` (R-COMPAT-7).
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const REGISTRY_PATH = join(ROOT, 'packages/mermaid/src/generated/registry.gen.ts');

/**
 * v12 detectors in registration order (`diagram-api/diagram-orchestration.ts` @ 12.2.0, with
 * `includeLargeFeatures`): [type, regex source, flags]. The `---` and `error` pseudo diagrams
 * are handled by the registry itself.
 */
export const V12_DETECTORS: readonly (readonly [string, string, string])[] = [
  ['flowchart-elk', '^\\s*flowchart-elk', ''],
  ['mindmap', '^\\s*mindmap', ''],
  ['architecture', '^\\s*architecture', ''],
  ['agentflow', '^\\s*agentflow-beta\\b', ''],
  ['c4', '^\\s*C4Context|C4Container|C4Component|C4Dynamic|C4Deployment', ''],
  ['kanban', '^\\s*kanban', ''],
  ['classDiagram', '^\\s*classDiagram', ''],
  ['er', '^\\s*erDiagram', ''],
  ['gantt', '^\\s*gantt', ''],
  ['info', '^\\s*info', ''],
  ['pie', '^\\s*pie', ''],
  ['requirement', '^\\s*requirement(Diagram)?', ''],
  ['sequence', '^\\s*sequenceDiagram', ''],
  ['swimlane', '^\\s*swimlane-beta\\b', ''],
  ['flowchart-v2', '^\\s*(graph|flowchart)', ''],
  ['timeline', '^\\s*timeline', ''],
  ['gitGraph', '^\\s*gitGraph', ''],
  ['stateDiagram', '^\\s*stateDiagram', ''],
  ['journey', '^\\s*journey', ''],
  ['quadrantChart', '^\\s*quadrantChart', ''],
  ['sankey', '^\\s*sankey(-beta)?', ''],
  ['packet', '^\\s*packet(-beta)?', ''],
  ['xychart', '^\\s*xychart(-beta)?', ''],
  ['block', '^\\s*block(-beta)?', ''],
  ['eventmodeling', '^\\s*eventmodeling', ''],
  ['treeView', '^\\s*treeView-beta', ''],
  ['radar', '^\\s*radar-beta', ''],
  ['ishikawa', '^\\s*ishikawa(-beta)?\\b', 'i'],
  ['treemap', '^\\s*treemap', ''],
  ['railroad', '^\\s*railroad-beta', 'i'],
  ['railroadEbnf', '^\\s*railroad-ebnf-beta', 'i'],
  ['railroadAbnf', '^\\s*railroad-abnf-beta', 'i'],
  ['railroadPeg', '^\\s*railroad-peg-beta', 'i'],
  ['venn', '^\\s*venn-beta', ''],
  ['wardley', '^\\s*wardley-beta', 'i'],
  ['cynefin', '^\\s*cynefin-beta(?:[\\s:]|$)', ''],
  ['usecase', '^\\s*usecase-beta(?:\\s|$)', ''],
];

/** The `mermaid` key of a diagram package's package.json (DESIGN §12.1). */
export interface DiagramManifest {
  readonly plugin: 'diagram';
  readonly id: string;
  /** The v12 diagram types it renders. */
  readonly types: readonly string[];
  readonly formats: readonly string[];
  /** The named export holding the plugin object. */
  readonly export: string;
  /** Module path of the lazily loaded text-output entry; its `ascii` export is the hook (D76). */
  readonly ascii?: string;
  /** Module path of the language facet entry, read by the language service (R-LANG-8, D89). */
  readonly language?: string;
}

/** A package.json `exports` map: subpath → conditions → file. */
type Exports = Readonly<Record<string, Readonly<Record<string, string>> | string>>;

export interface ManifestSource {
  readonly name: string;
  readonly manifest: DiagramManifest;
  /** The package's `exports`; resolves the `ascii` entry's file to an import subpath. */
  readonly exports?: Exports;
}

/** The import specifier serving `file` (`./dist/ascii.js` → `<name>/ascii`). */
function specifierFor(source: ManifestSource, file: string): string {
  for (const [subpath, target] of Object.entries(source.exports ?? {})) {
    const files = typeof target === 'string' ? [target] : Object.values(target);
    if (files.includes(file))
      return subpath === '.' ? source.name : `${source.name}${subpath.slice(1)}`;
  }
  throw new Error(`${source.name}: no exports subpath serves the ascii entry "${file}"`);
}

/** Reads the manifests of `packages/diagram-*`. */
export function readManifests(root = ROOT): ManifestSource[] {
  const out: ManifestSource[] = [];
  const dir = join(root, 'packages');
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry, 'package.json');
    if (!entry.startsWith('diagram-') || !existsSync(path)) continue;
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
      name: string;
      mermaid?: DiagramManifest;
      exports?: Exports;
    };
    if (pkg.mermaid?.plugin === 'diagram')
      out.push({ name: pkg.name, manifest: pkg.mermaid, exports: pkg.exports });
  }
  return out;
}

export function generateRegistry(manifests: readonly ManifestSource[]): string {
  const byType = new Map<string, ManifestSource>();
  for (const m of manifests) {
    for (const type of m.manifest.types) {
      if (!V12_DETECTORS.some(([t]) => t === type)) {
        throw new Error(`${m.name}: type "${type}" is not a v12 diagram type`);
      }
      byType.set(type, m);
    }
  }
  const lines = [
    '// Generated by `pnpm gen:registry` (tools/gen-config/src/registry.ts). Do not edit.',
    "import type { FirstPartyEntry } from '../registry.ts';",
    '',
    '/** First-party diagram types in v12 detection order (DESIGN §12.4, ADR-6). */',
    'export const FIRST_PARTY: readonly FirstPartyEntry[] = [',
  ];
  for (const [type, source, flags] of V12_DETECTORS) {
    const m = byType.get(type);
    const pattern = `/${source}/${flags}`;
    if (!m) {
      lines.push(`  { type: '${type}', pattern: ${pattern} },`);
      continue;
    }
    const formats = m.manifest.formats.map((f) => `'${f}'`).join(', ');
    lines.push(
      `  {`,
      `    type: '${type}',`,
      `    pattern: ${pattern},`,
      `    id: '${m.manifest.id}',`,
      `    formats: [${formats}],`,
      `    load: () => import('${m.name}').then((m) => m.${m.manifest.export}),`
    );
    if (m.manifest.ascii !== undefined) {
      const ascii = specifierFor(m, m.manifest.ascii);
      lines.push(`    loadAscii: () => import('${ascii}').then((m) => m.ascii),`);
    }
    lines.push(`  },`);
  }
  lines.push('];', '');
  return lines.join('\n');
}
