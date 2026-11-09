// cspell:words dedented
/**
 * The ishikawa corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 * Diagrams go in as `.mmd` fixtures under `e2e/diagrams/ishikawa/`; text that only matters to
 * the lexer or the parser (rejections, comment forms, CRs, line separators) goes in
 * `corpus/ishikawa-cases.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IshikawaTokenKind, JISON_NAMES } from '@mermaid-js/diagram-ishikawa';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { body, crlf, tabs } from '../kanban/corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * Every indent removed: each line after the effect is then a level-1 cause, and the first
 * cause's indent (the baseline) is 0, so the line-start rules see `TEXT` without `SPACELIST`.
 */
export const dedented = (src: string): string => body(src, (b) => b.replace(/^[ \t]+/gm, ''));

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the `ishikawa` header line (pitfall 3):
 * at the middle of the line's text after its indent, moved off a surrogate pair. Lines with
 * fewer than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*ishikawa/i.test(l));
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

/** The cases (`corpus/ishikawa-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function ishikawaCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/ishikawa-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The ishikawa corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function ishikawaCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/ishikawa'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/ishikawa-v12-specs.json'), 'utf8')
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
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function ishikawaGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await ishikawaCorpus()), ...ishikawaCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}

/**
 * The gate's generated variants for the parity suite (the e2e fixtures, spec strings and cases
 * themselves are in the suite's dirs and files), ids prefixed `ishikawa-gate/`.
 */
export async function ishikawaParityCorpus(): Promise<CorpusItem[]> {
  const listed = new Set([...(await ishikawaCorpus()), ...ishikawaCases()].map((c) => c.id));
  return (await ishikawaGateCorpus())
    .filter((item) => !listed.has(item.id))
    .map((item) => ({ id: `ishikawa-gate/${item.id}`, source: item.source }));
}

/**
 * Names no message may hold (R-ERR-5): v12's jison terminals (all capitals, `ISHIKAWA` as well:
 * the keyword is shown in lower case), v13's compound kind names (`CommentLine`, `SpaceList`,
 * …), and the compound rule names of v12's `ishikawa.jison` (`spaceLines`); `start`, `stop`,
 * `document` and `statement` are plain words.
 */
export const INTERNAL_NAMES = new RegExp(
  `\\b(?:${[
    ...Object.values(JISON_NAMES).filter((n) => /_|^[A-Z]{2,}$/.test(n)),
    ...Object.keys(IshikawaTokenKind).filter((n) => /^[A-Z][a-z]+[A-Z]/.test(n)),
    'spaceLines',
  ].join('|')})\\b`
);

/**
 * A message without the author's own text it quotes (what was found, the causes a warning
 * names), which may hold any word.
 */
export const withoutQuotes = (message: string): string =>
  message
    .replace(/got `[\s\S]*?`/g, 'got `…`')
    .replace(/`[^`]*` at line/g, '`…` at line')
    .replace(/after `[^`]*`/g, 'after `…`');
