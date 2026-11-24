/**
 * The agentflow corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import {
  body,
  crlf,
  DIRECTIVE,
  FRONT_MATTER,
  midLineDirective,
  tabs,
  withVariants,
} from '../gate-variants.ts';
import type { Variant } from '../gate-variants.ts';
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
export const agentflowCases = (): CorpusItem[] => corpusJson('agentflow-cases.json');

/**
 * D691: the cases with a comment before the header that 12.2.0 read as a `direction` or a link
 * id and rejected, where v13 and the grammar read a comment; and their variants.
 */
export const HEADER_COMMENT_CASE =
  /^agentflow-cases\/header-comment-(?:direction(?:-text)?|link-id)(?= \(|$)/;

/** The text before the header line of `src`, and the rest. */
export function splitAtHeader(src: string): [head: string, rest: string] {
  const at = /^[^\S\n]*agentflow-beta/m.exec(src)?.index ?? 0;
  return [src.slice(0, at), src.slice(at)];
}

/** D691: whether `src` has such a comment before its header. */
export const hasHeaderComment = (src: string): boolean =>
  /^[^\S\n]*%%(?:[^\n]*direction\s+(?:TB|BT|RL|LR|TD)|[^\s"]+@(?![{"]))/m.test(
    splitAtHeader(src)[0]
  );

/** The agentflow corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const agentflowCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('agentflow');

/** The generated variants of each gate source, by id suffix. */
export const AGENTFLOW_VARIANTS: readonly Variant[] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['line separators', lineSeparators],
  ['paragraph separators', paragraphSeparators],
  ['tabs', tabs],
  ['multi-line shape data', multiLineData],
  ['mid-line directive', midLineDirective(/^\s*agentflow-beta/)],
  ['brace blanks', braceBlanks],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link AGENTFLOW_VARIANTS} that changes it.
 */
export async function agentflowGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await agentflowCorpus()), ...agentflowCases()], AGENTFLOW_VARIANTS);
}
