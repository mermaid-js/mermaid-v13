// cspell:words dedented
/**
 * The venn corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the cases
 * file, and the lexer gate's set, which adds generated variants of
 * every source. Diagrams go in as `.mmd` fixtures under `e2e/diagrams/venn/`; text that only
 * matters to the lexer or the parser (rejections, comment forms, CRs) goes in
 * `corpus/venn-cases.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { body, crlf, tabs } from '../kanban/corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * Every indent removed: an indented `text` is then a plain `text` statement, which v12 parses
 * differently (or rejects), so the lexer's line-start rules see the other branch.
 */
export const dedented = (src: string): string => body(src, (b) => b.replace(/^[ \t]+/gm, ''));

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the `venn-beta` header line (pitfall 3):
 * at the middle of the line's text after its indent, moved off a surrogate pair. Lines with
 * fewer than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*venn-beta/.test(l));
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

/** The cases (`corpus/venn-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function vennCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/venn-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The venn corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function vennCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/venn'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/venn-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['dedented', dedented],
  ['mid-line directive', midLineDirective],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of {@link VARIANTS} that changes it.
 */
export async function vennGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await vennCorpus()), ...vennCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
