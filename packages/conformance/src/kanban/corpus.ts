/**
 * The kanban corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 */
import { corpusJson, fixturesAndSpecs } from '../corpus.ts';
import {
  body,
  crlf,
  DIRECTIVE,
  gateVariants,
  midLineDirective,
  tabs,
  withVariants,
} from '../gate-variants.ts';
import type { Variant } from '../gate-variants.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * Each one-line `@{ a: b, c: d }` as a block over several lines, one pair a line, indented
 * two past its item's line.
 */
export const multiLineData = (src: string): string =>
  body(src, (b) =>
    b.replace(
      /^([^\S\n]*)(.*?)@\{([^}\n]*)\}/gm,
      (_m, indent: string, head: string, data: string) => {
        const pairs = data
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p !== '');
        return `${indent}${head}@{\n${pairs.map((p) => `${indent}  ${p}\n`).join('')}${indent}}`;
      }
    )
  );

/** The cases (`corpus/kanban-cases.json`): each corpus gap, quirk and rejection v12 has. */
export const kanbanCases = (): CorpusItem[] => corpusJson('kanban-cases.json');

/** The kanban corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export const kanbanCorpus = (): Promise<CorpusItem[]> => fixturesAndSpecs('kanban');

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly Variant[] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, DIRECTIVE)],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['multi-line shape data', multiLineData],
  // Through every item line after the `kanban` header line.
  ['mid-line directive', midLineDirective(/^\s*kanban/i)],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function kanbanGateCorpus(): Promise<CorpusItem[]> {
  return withVariants([...(await kanbanCorpus()), ...kanbanCases()], VARIANTS);
}

/**
 * The gate corpus less the items the parity suite already reads from its dirs and files
 * (`registry.ts`), ids prefixed `kanban-gate/`: model parity over the whole gate corpus.
 */
export async function kanbanParityCorpus(): Promise<CorpusItem[]> {
  const listed = [...(await kanbanCorpus()), ...kanbanCases()];
  return gateVariants(await kanbanGateCorpus(), listed, 'kanban');
}
