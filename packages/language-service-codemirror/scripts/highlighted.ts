/**
 * The diagram types this adapter highlights (D134): every first-party diagram package whose
 * manifest has a `language` entry, by its manifest id (the facet id, `FirstPartyFacetId`), in
 * package order. A port's package joins by its manifest; no list here names it.
 *
 * Each one's grammar is `packages/diagram-<type>/grammar/<type>.ebnf`, and beside it the
 * documents the adapters' tests read: `<type>.sample.mmd`, a short document whose first word is
 * the header (first paint), and `<type>.agree.mmd`, a longer one that folds (the adapters agree).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..', '..');

export interface Highlighted {
  /** The facet id: the manifest's `id` (`quadrantChart`). */
  readonly id: string;
  /** The package directory without `diagram-`, which names its grammar files (`quadrant`). */
  readonly type: string;
  /** The package's `grammar/` folder, absolute. */
  readonly grammarDir: string;
}

/** Every highlighted type, in package order. */
export function highlighted(root: string = ROOT): Highlighted[] {
  const out: Highlighted[] = [];
  for (const dir of readdirSync(join(root, 'packages')).sort()) {
    const path = join(root, 'packages', dir, 'package.json');
    if (!dir.startsWith('diagram-') || !existsSync(path)) continue;
    const manifest = (
      JSON.parse(readFileSync(path, 'utf8')) as {
        mermaid?: { plugin?: string; id?: string; language?: string };
      }
    ).mermaid;
    if (manifest?.plugin !== 'diagram' || manifest.language === undefined) continue;
    if (manifest.id === undefined) throw new Error(`packages/${dir}: the manifest has no id`);
    const type = dir.slice('diagram-'.length);
    out.push({ id: manifest.id, type, grammarDir: join(root, 'packages', dir, 'grammar') });
  }
  return out;
}

/** A highlighted type's test document: `sample` (first paint) or `agree` (adapters agree). */
export function sampleOf(h: Highlighted, kind: 'sample' | 'agree'): string {
  return readFileSync(join(h.grammarDir, `${h.type}.${kind}.mmd`), 'utf8');
}

/**
 * `src/grammars.ts` with its last statement, the `export const <name>` map from each id to its
 * lazily imported generated file, rewritten for `types`. Everything above that statement is
 * kept as written; `row(id)` is the row's value. Rows are laid out as prettier lays them out.
 */
export function withMap(
  current: string,
  head: string,
  types: readonly Highlighted[],
  row: (id: string) => string
): string {
  const at = current.indexOf(head);
  if (at < 0) throw new Error(`src/grammars.ts has no \`${head}\``);
  const rows = types.map(({ id }) => {
    const value = row(id);
    const line = `  ${id}: ${value},`;
    if (line.length <= 100) return line;
    // Too long for one line: prettier breaks the object value, else the arrow after `=>`.
    if (value.startsWith('{ ') && value.endsWith(' }'))
      return `  ${id}: {\n    ${value.slice(2, -2)},\n  },`;
    const arrow = value.indexOf('=> ');
    return `  ${id}: ${value.slice(0, arrow + 2)}\n    ${value.slice(arrow + 3)},`;
  });
  return `${current.slice(0, at)}${head} {\n${rows.join('\n')}\n};\n`;
}
