/**
 * The agentflow corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { body, crlf, FRONT_MATTER, tabs } from '../kanban/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import { lineSeparators, paragraphSeparators } from '../xychart/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * `src` with nine comment lines after every line of the body, or, for a body of two lines or
 * fewer, one through the middle of it but never inside the header line (sequence's variant
 * cut `agentflow-beta` itself there, which v12 no longer detects). v12 kept comments in the
 * text it lexed, so both lexers read them as `COMMENT` tokens.
 */
export function commented(src: string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  const b = src.slice(head.length);
  const lines = b.split('\n');
  if (lines.length > 2) return head + lines.join('\n' + '  %% c\n'.repeat(9));
  const header = /agentflow-beta\b[^\n]*/.exec(b);
  const cut = Math.max(Math.floor(b.length / 2), header ? header.index + header[0].length : 0);
  return head + b.slice(0, cut) + '\n%% cut\n' + b.slice(cut);
}

/** A directive v12 removes, wherever in a line it is. */
const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the `agentflow-beta` header line
 * (pitfall 3): at the middle of the line's text after its indent, moved off a surrogate pair.
 * Lines with fewer than two characters of text, `%%` lines and blank lines are left as they
 * are.
 */
export const midLineDirective = (src: string): string =>
  body(src, (b) => {
    const lines = b.split('\n');
    const header = lines.findIndex((l) => /^\s*agentflow-beta/.test(l));
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
 * Each one-line `@{ a: b, c: d }` outside a comment line as a block over several lines, one
 * pair a line, indented two past its line (kanban's variant, which also rewrote comments).
 */
export const multiLineData = (src: string): string =>
  body(src, (b) =>
    b.replace(
      /^([^\S\n]*)(?!%%)(.*?)@\{([^}\n]*)\}/gm,
      (_m, indent: string, head: string, data: string) => {
        const pairs = data
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p !== '');
        return `${indent}${head}@{\n${pairs.map((p) => `${indent}  ${p}\n`).join('')}${indent}}`;
      }
    )
  );

/**
 * Blanks between every `}` and its line break, and a blank line after it: v12 removed the
 * blanks (`}[^\S\n]*\n`) and kept the blank line.
 */
export const braceBlanks = (src: string): string =>
  body(src, (b) => b.replace(/\}[^\S\n]*\n/g, '} \t \n\n'));

/** The cases (`corpus/agentflow-cases.json`): each corpus gap, quirk and rejection v12 has. */
export function agentflowCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/agentflow-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The agentflow corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function agentflowCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/agentflow'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/agentflow-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['line separators', lineSeparators],
  ['paragraph separators', paragraphSeparators],
  ['tabs', tabs],
  ['multi-line shape data', multiLineData],
  ['mid-line directive', midLineDirective],
  ['brace blanks', braceBlanks],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function agentflowGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await agentflowCorpus()), ...agentflowCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
