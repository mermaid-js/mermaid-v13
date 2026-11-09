/**
 * The sankey corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { body, crlf } from '../kanban/corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The cases (`corpus/sankey-cases.json`): each quirk and rejection of v12's sankey lexer, and
 * the line-separator cases (`line-separator-*`: U+2028 and U+2029, which `\s` takes, so
 * `prepareTextForParsing` trims them off the ends, which no sankey rule consumes, and after
 * which v12's comment removal starts a line).
 */
export function sankeyCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/sankey-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The sankey corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function sankeyCorpus(): Promise<CorpusItem[]> {
  const out: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/sankey'), 'e2e')) {
    out.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/sankey-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...out, ...specs];
}

/**
 * A directive through the middle of every line of two characters or more that holds no `%%`
 * (pitfall 3's mid-line cut, which `commented` makes only in bodies of two lines or fewer).
 */
export const directiveMidLine = (src: string): string =>
  body(src, (b) =>
    b
      .split('\n')
      .map((line) => {
        if (line.length < 2 || line.includes('%%')) return line;
        const half = line.length >> 1;
        return line.slice(0, half) + '%%{init: {}}%%' + line.slice(half);
      })
      .join('\n')
  );

/** Every line break doubled: v12's `prepareTextForParsing` collapsed the blank lines. */
export const blankLines = (src: string): string => body(src, (b) => b.replace(/\n/g, '\n\n'));

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, '%%{init: {}}%%')],
  ['CRLF', crlf],
  ['blank lines', blankLines],
  ['directive mid-line', directiveMidLine],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function sankeyGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await sankeyCorpus()), ...sankeyCases()];
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
 * The gate corpus less the items the parity suite already reads from its dirs and files
 * (`registry.ts`), ids prefixed `sankey-gate/`: model parity over the whole gate corpus.
 */
export async function sankeyParityCorpus(): Promise<CorpusItem[]> {
  const listed = new Set([...(await sankeyCorpus()), ...sankeyCases()].map((c) => c.id));
  return (await sankeyGateCorpus())
    .filter((item) => !listed.has(item.id))
    .map((item) => ({ id: `sankey-gate/${item.id}`, source: item.source }));
}
