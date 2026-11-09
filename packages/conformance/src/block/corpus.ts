/**
 * The block corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, and the lexer gate's set, which adds generated variants of every source. Diagrams go
 * in as `.mmd` fixtures under `e2e/diagrams/block/`; text that only matters to the lexer or
 * the parser (rejections, comment forms, CRs, line separators) goes in
 * `corpus/block-cases.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { body, crlf, FRONT_MATTER, tabs } from '../kanban/corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the header line (pitfall 3): at the
 * middle of the line's text after its indent, moved off a surrogate pair. Lines with fewer
 * than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*block/.test(l));
    return lines
      .map((line, k) => {
        const text = line.trimStart();
        if (k <= header || text.length < 2 || text.startsWith('%%')) return line;
        let at = line.length - text.length + Math.floor(text.length / 2);
        if (/[\udc00-\udfff]/.test(line.charAt(at))) at++;
        return line.slice(0, at) + DIRECTIVE + line.slice(at);
      })
      .join('\n');
  });

/**
 * Sequence's `commented` (nine comment lines between lines), except that a body of two lines or
 * fewer is cut through the middle of its text after the header keyword, not through the
 * header (moved off a surrogate pair): v12 detects no block in a copy with a cut header, so
 * that variant would not be compared. A body with nothing after the header is left as it is.
 */
export function blockCommented(src: string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  const b = src.slice(head.length);
  if (b.split('\n').length > 2) return commented(src);
  const after = /^\s*block(?:-beta)?/.exec(b)?.[0].length ?? 0;
  if (b.length - after < 2) return src;
  let at = after + Math.floor((b.length - after) / 2);
  if (/[\udc00-\udfff]/.test(b.charAt(at))) at++;
  return head + b.slice(0, at) + '\n%% cut\n' + b.slice(at);
}

/** The cases (`corpus/block-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function blockCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/block-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The block corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function blockCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/block'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/block-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', blockCommented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['mid-line directive', midLineDirective],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function blockGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await blockCorpus()), ...blockCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
