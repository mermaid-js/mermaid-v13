/**
 * The kanban corpora: the e2e fixtures and harvested v12 spec and syntax-page strings, the
 * cases file, and the lexer gate's set, which adds generated variants of every source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import { crCut } from '../timeline/corpus.ts';
import type { CorpusItem } from '../types.ts';

const FRONT_MATTER = /^---[\s\S]*?\n---[^\S\n]*\n/;

/** `edit` applied to the text after the front matter. */
function body(src: string, edit: (text: string) => string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  return head + edit(src.slice(head.length));
}

/** Every line break a CRLF. */
export const crlf = (src: string): string => body(src, (b) => b.replace(/\r?\n/g, '\r\n'));

/** Each indent of spaces as tabs, one per two spaces (rounded up). */
export const tabs = (src: string): string =>
  body(src, (b) => b.replace(/^ +/gm, (m) => '\t'.repeat(Math.ceil(m.length / 2))));

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
export function kanbanCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/kanban-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** The kanban corpus: the e2e fixtures and the v12 spec and syntax-page strings. */
export async function kanbanCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/kanban'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/kanban-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The generated variants of each gate source, by id suffix. */
export const VARIANTS: readonly [suffix: string, make: (src: string) => string][] = [
  ['commented', commented],
  ['CR cut', (src: string): string => crCut(src, '%% c')],
  ['CR cut by a directive', (src: string): string => crCut(src, '%%{init: {}}%%')],
  ['CRLF', crlf],
  ['tabs', tabs],
  ['multi-line shape data', multiLineData],
];

/**
 * The e2e fixtures, the v12 spec strings and the cases, and each of them in every variant of
 * {@link VARIANTS} that changes it.
 */
export async function kanbanGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await kanbanCorpus()), ...kanbanCases()];
  const out = [...all];
  for (const [suffix, make] of VARIANTS) {
    for (const item of all) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}
