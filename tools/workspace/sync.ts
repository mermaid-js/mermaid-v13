/**
 * `pnpm regen`'s first step: the files every diagram port used to edit by hand, rewritten from
 * the diagram packages (`diagrams.ts`). A port adds `packages/diagram-<type>/` and runs
 * `pnpm regen`; it never edits these files, and a merge conflict in one is resolved by taking
 * either side and running `pnpm regen` again.
 *
 * - The `@mermaid-js/diagram-*` entries of the package.json files that depend on every diagram
 *   ({@link DEPENDENCY_RULES}). Other keys keep their place; the diagram keys keep the sorted
 *   order the files already had.
 * - The diagram rows of the package table in `v13/docs/RELEASING.md`, between its markers,
 *   from each package's `workspace.yaml` `release:` (a package without one has no row).
 * - mermaid's `THIRD_PARTY_NOTICES`, from its own part and each diagram package's
 *   `notices/mermaid.txt` ({@link MERMAID_NOTICES}).
 *
 * `sync.spec.ts` fails when any of these is stale, so `pnpm test` (and so `pnpm check`) catches
 * a hand edit or a missed regen.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { ROOT, workspaceDiagrams, type WorkspaceDiagram } from './diagrams.ts';

type DependencyField =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'peerDependenciesMeta';

interface DependencyRule {
  /** Workspace-relative package directory. */
  readonly pkg: string;
  readonly field: DependencyField;
  /** The value each diagram's entry gets. */
  readonly value: unknown;
  /** Which diagram packages it depends on. */
  readonly select: (d: WorkspaceDiagram, root: string) => boolean;
}

/** Every diagram package, a pre-manifest one too (`WorkspaceDiagram`). */
const all = (): boolean => true;
/** A package with its plugin manifest: the published-package lists name only these. */
const plugin = (d: WorkspaceDiagram): boolean => d.manifest !== undefined;
const withLanguage = (d: WorkspaceDiagram): boolean => d.manifest?.language !== undefined;

/** The diagram packages named by an import in `dir`'s sources (its own per-diagram specs). */
function importedBy(dir: string): (d: WorkspaceDiagram, root: string) => boolean {
  const cache = new Map<string, Set<string>>();
  return (d, root) => {
    let names = cache.get(root);
    if (!names) {
      const found = new Set<string>();
      const walk = (path: string): void => {
        for (const entry of readdirSync(path)) {
          const file = join(path, entry);
          if (statSync(file).isDirectory()) {
            if (entry !== 'node_modules' && entry !== 'generated') walk(file);
          } else if (/\.[cm]?[jt]s$/.test(entry))
            for (const m of readFileSync(file, 'utf8').matchAll(
              /['"](@mermaid-js\/diagram-[\w-]+)/g
            ))
              found.add(m[1]!);
        }
      };
      walk(join(root, dir));
      cache.set(root, found);
      names = found;
    }
    return names.has(d.name);
  };
}

/** Every package.json block that lists diagram packages, and which diagrams it lists. */
export const DEPENDENCY_RULES: readonly DependencyRule[] = [
  // The public package bundles every diagram (the CDN build and `mermaid`'s registry).
  { pkg: 'packages/mermaid', field: 'dependencies', value: 'workspace:*', select: plugin },
  // The language service loads each type's `/language` facet; the diagrams are optional peers.
  {
    pkg: 'packages/language-service',
    field: 'devDependencies',
    value: 'workspace:*',
    select: withLanguage,
  },
  {
    pkg: 'packages/language-service',
    field: 'peerDependencies',
    value: 'workspace:*',
    select: withLanguage,
  },
  {
    pkg: 'packages/language-service',
    field: 'peerDependenciesMeta',
    value: { optional: true },
    select: withLanguage,
  },
  // The LSP server ships every facet.
  {
    pkg: 'packages/language-server',
    field: 'dependencies',
    value: 'workspace:*',
    select: withLanguage,
  },
  // Private: the parity oracle runs every type from its T1 on, before the type has a
  // manifest; the benchmarks run the registered ones.
  { pkg: 'packages/conformance', field: 'devDependencies', value: 'workspace:^', select: all },
  { pkg: 'packages/bench', field: 'devDependencies', value: 'workspace:^', select: plugin },
  // The grammar tool's per-type agreement specs import their own package.
  {
    pkg: 'tools/gen-grammar',
    field: 'devDependencies',
    value: 'workspace:^',
    select: importedBy('tools/gen-grammar/src'),
  },
];

/**
 * `block` with its diagram entries replaced by `wanted` (sorted by name), where the first one
 * was, or in sorted place among the other keys when the block had none.
 */
function withDiagrams(
  block: Readonly<Record<string, unknown>>,
  wanted: readonly string[],
  value: unknown
): Record<string, unknown> {
  const entries = Object.entries(block);
  const others = entries.filter(([k]) => !k.startsWith('@mermaid-js/diagram-'));
  const diagrams = [...wanted].sort().map((name) => [name, value] as const);
  const first = entries.findIndex(([k]) => k.startsWith('@mermaid-js/diagram-'));
  const at =
    first >= 0
      ? entries.slice(0, first).filter(([k]) => !k.startsWith('@mermaid-js/diagram-')).length
      : others.filter(([k]) => k < (diagrams[0]?.[0] ?? '')).length;
  return Object.fromEntries([...others.slice(0, at), ...diagrams, ...others.slice(at)]);
}

/** package.json as `pnpm`/prettier write it: two-space JSON and a final newline. */
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export const RELEASING = 'v13/docs/RELEASING.md';
export const RELEASING_BEGIN = '<!-- BEGIN GENERATED DIAGRAM ROWS: pnpm regen -->';
export const RELEASING_END = '<!-- END GENERATED DIAGRAM ROWS -->';

/** The RELEASING.md table rows of the diagram packages that have a `release:` entry. */
function releaseRows(diagrams: readonly WorkspaceDiagram[]): string[] {
  return diagrams
    .filter((d) => d.manifest !== undefined && !d.private && d.wiring.release !== undefined)
    .map((d) => `| \`${d.name}\` | ${d.wiring.release!.summary} | ${d.wiring.release!.install} |`);
}

/**
 * The table between the markers with its diagram rows replaced by `rows`, where the first one
 * stood (a comment inside a Markdown table would end it, so the markers enclose the whole
 * table and the other rows stay as written).
 */
function spliceReleasing(existing: string, rows: readonly string[]): string {
  const begin = existing.indexOf(RELEASING_BEGIN);
  const end = existing.indexOf(RELEASING_END);
  if (begin < 0 || end < begin)
    throw new Error(`${RELEASING}: missing the ${RELEASING_BEGIN} … ${RELEASING_END} markers`);
  const start = begin + RELEASING_BEGIN.length;
  const lines = existing.slice(start, end).split('\n');
  const first = lines.findIndex((l) => l.startsWith('| `@mermaid-js/diagram-'));
  if (first < 0) throw new Error(`${RELEASING}: the table between the markers has no diagram row`);
  const kept = lines.filter((l) => !l.startsWith('| `@mermaid-js/diagram-'));
  kept.splice(first, 0, ...rows);
  return existing.slice(0, start) + kept.join('\n') + existing.slice(end);
}

/**
 * Every file this step writes, workspace-relative path → content. A file whose content equals
 * what is on disk is up to date.
 */
export function syncedFiles(root = ROOT): Map<string, string> {
  const diagrams = workspaceDiagrams(root);
  const files = new Map<string, string>();
  const manifests = new Map<string, Record<string, unknown>>();
  for (const rule of DEPENDENCY_RULES) {
    const path = `${rule.pkg}/package.json`;
    const manifest =
      manifests.get(path) ??
      (JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>);
    manifests.set(path, manifest);
    const block = (manifest[rule.field] ?? {}) as Record<string, unknown>;
    const wanted = diagrams.filter((d) => rule.select(d, root)).map((d) => d.name);
    manifest[rule.field] = withDiagrams(block, wanted, rule.value);
  }
  for (const [path, manifest] of manifests) files.set(path, json(manifest));

  const releasing = join(root, RELEASING);
  if (existsSync(releasing))
    files.set(RELEASING, spliceReleasing(readFileSync(releasing, 'utf8'), releaseRows(diagrams)));

  const own = join(root, MERMAID_NOTICES_OWN);
  if (existsSync(own)) {
    const parts = [
      own,
      // mermaid bundles a package once it is registered, so only then do its notices join.
      ...diagrams
        .filter(plugin)
        .map((d) => join(root, d.dir, BUNDLED_NOTICES))
        .filter((p) => existsSync(p)),
    ];
    files.set(
      MERMAID_NOTICES,
      `${parts.map((p) => readFileSync(p, 'utf8').replace(/\n+$/, '')).join('\n\n')}\n`
    );
  }
  for (const [path, text] of docLists(root)) files.set(path, text);
  return files;
}

/**
 * mermaid's THIRD_PARTY_NOTICES: its own sections, then the sections each diagram package's
 * `notices/mermaid.txt` gives for the ported code the CDN build bundles without its legal
 * comments, in package order. The licence check (`pnpm check:licenses`) says what they must hold.
 */
export const MERMAID_NOTICES = 'packages/mermaid/THIRD_PARTY_NOTICES';
const MERMAID_NOTICES_OWN = 'packages/mermaid/notices/own.txt';
export const BUNDLED_NOTICES = 'notices/mermaid.txt';

/** The workspace-relative paths whose content differs from {@link syncedFiles}. */
export function staleFiles(root = ROOT): string[] {
  return [...syncedFiles(root)]
    .filter(([path, content]) => {
      const file = join(root, path);
      return !existsSync(file) || readFileSync(file, 'utf8') !== content;
    })
    .map(([path]) => path);
}

// ---------------------------------------------------------------------------- doc lists

/**
 * The lists of diagram types in hand-written docs, each built from one fragment per type so a
 * port adds a file instead of editing a shared sentence. A list sits between inline markers,
 * `<!-- BEGIN <name> -->…<!-- END <name> -->`, which render as nothing, so the paragraph reads
 * as before; a fragment file is `<order>-<type>.md` (numbered ones first, a new port's
 * `<type>.md` after them).
 *
 * - `v13/docs/ascii.md`: the types with text output, from `v13/docs/ascii/*.md`. A fragment's
 *   YAML front matter names it in the intro (`intro`), in the CLI exit-code paragraph (`cli`,
 *   optional) and in the size paragraph (`size`); its body, when it has one, is its section,
 *   and the sections stand between the `ascii-sections` markers in fragment order.
 * - `v13/docs/MIGRATION.md` "Hand-drawn look": what is sketched, one `v13/docs/hand-drawn/*.md`
 *   phrase per sketched type; and the v12-sketched types not ported yet, {@link V12_SKETCHED}
 *   without those that have a phrase.
 */
export const ASCII_DOC = 'v13/docs/ascii.md';
export const ASCII_FRAGMENTS = 'v13/docs/ascii';
export const MIGRATION_DOC = 'v13/docs/MIGRATION.md';
export const HAND_DRAWN_FRAGMENTS = 'v13/docs/hand-drawn';

/**
 * The types v12 sketched with `look: handDrawn` whose v13 port had not landed when this list was
 * written (v12 is frozen, so it never grows). Each leaves the "not ported yet" sentence when it
 * adds its `v13/docs/hand-drawn/` phrase.
 */
export const V12_SKETCHED: readonly string[] = [
  'requirement',
  'block',
  'swimlanes',
  'usecase',
  'agentflow',
];

interface DocFragment {
  /** The type: the file name without its order prefix and `.md`. */
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly body: string;
}

function docFragments(root: string, dir: string): DocFragment[] {
  const path = join(root, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((name) => {
      const text = readFileSync(join(path, name), 'utf8');
      const front = /^---\n([\s\S]*?)\n---\n?/.exec(text);
      const data = (front ? load(front[1]!) : {}) as Record<string, unknown>;
      return {
        type: name.replace(/^\d+-/, '').replace(/\.md$/, ''),
        data,
        body: (front ? text.slice(front[0].length) : text).trim(),
      };
    });
}

/** `a`, `a and b`, `a, b and c` (with `last` for the final joiner). */
function listOf(items: readonly string[], last = ' and '): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')}${last}${items[items.length - 1]!}`;
}

/** `text` with the content between `<!-- BEGIN name … -->` and `<!-- END name -->` replaced. */
function splice(text: string, path: string, name: string, value: string): string {
  const begin = new RegExp(`<!-- BEGIN ${name}\\b[^>]*-->`).exec(text);
  const endMark = `<!-- END ${name} -->`;
  const end = begin ? text.indexOf(endMark, begin.index) : -1;
  if (!begin || end < 0) throw new Error(`${path}: missing the ${name} markers`);
  return text.slice(0, begin.index + begin[0].length) + value + text.slice(end);
}

export function docLists(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const ascii = join(root, ASCII_DOC);
  if (existsSync(ascii)) {
    const parts = docFragments(root, ASCII_FRAGMENTS);
    const field = (key: string) =>
      parts.map((p) => p.data[key]).filter((v): v is string => typeof v === 'string');
    let text = readFileSync(ascii, 'utf8');
    text = splice(text, ASCII_DOC, 'ascii-list:intro', listOf(field('intro')));
    text = splice(text, ASCII_DOC, 'ascii-list:cli', listOf(field('cli')));
    text = splice(text, ASCII_DOC, 'ascii-list:size', listOf(field('size'), ' or '));
    const sections = parts.map((p) => p.body).filter((b) => b !== '');
    text = splice(text, ASCII_DOC, 'ascii-sections', `\n\n${sections.join('\n\n')}\n\n`);
    out.set(ASCII_DOC, text);
  }
  const migration = join(root, MIGRATION_DOC);
  if (existsSync(migration)) {
    const sketched = docFragments(root, HAND_DRAWN_FRAGMENTS);
    const types = new Set(sketched.map((p) => p.type));
    let text = readFileSync(migration, 'utf8');
    text = splice(
      text,
      MIGRATION_DOC,
      'hand-drawn-list:sketched',
      listOf(sketched.map((p) => p.body))
    );
    text = splice(
      text,
      MIGRATION_DOC,
      'hand-drawn-list:pending',
      V12_SKETCHED.filter((t) => !types.has(t)).join(', ')
    );
    out.set(MIGRATION_DOC, text);
  }
  return out;
}
