/**
 * The sankey corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { crlf } from '../kanban/corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const S = 'sankey\n';

const items = (prefix: string, sources: string[]): CorpusItem[] =>
  sources.map((source, k) => ({ id: `${prefix} ${k}`, source }));

/**
 * U+2028 and U+2029: `\s` takes them (so `prepareTextForParsing` trims them off the ends), no
 * sankey rule consumes them (v12's lexer stalls on one), and v12's comment removal (`^`,
 * multiline) starts a line after them.
 */
export const LINE_SEPARATORS: CorpusItem[] = items('line separators', [
  S + 'a,b,1 c,d,2',
  S + 'a,b,1 ',
  S + ' a,b,1',
  S + '"a b",c,1',
  S + 'a,b,1\n %% c\nc,d,2',
  S + 'a,b,1 %% c\nc,d,2',
  S + 'a,b,1   %% c c,d,2',
  'sankey a,b,1',
  'sankey \na,b,1',
]);

/** The cases (`corpus/sankey-cases.json`): each quirk and rejection of v12's sankey lexer. */
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

const FRONT_MATTER = /^---[\s\S]*?\n---[^\S\n]*\n/;

/** `edit` applied to the text after the front matter. */
function body(src: string, edit: (text: string) => string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  return head + edit(src.slice(head.length));
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
 * The e2e fixtures, the v12 spec strings, the cases and the line-separator cases, and each of
 * them in every variant of {@link VARIANTS} that changes it.
 */
export async function sankeyGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await sankeyCorpus()), ...sankeyCases(), ...LINE_SEPARATORS];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
