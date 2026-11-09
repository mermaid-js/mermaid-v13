/**
 * The railroad corpora (#526): the e2e fixtures and the harvested v12 spec strings, and the
 * gates' set, which adds the hand-written cases of `corpus/railroad-cases.json` (the spec's
 * quirks and rejected inputs, line separators), the recovery set of
 * `corpus/railroad-recovery.json` and a CRLF and a commented copy of every source.
 * One corpus holds all four notations (D511); {@link notationOf} routes each source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { RailroadNotation } from '@mermaid-js/diagram-railroad/testing';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import { commented } from '../sequence/corpus.ts';
import type { CorpusItem } from '../types.ts';

const readItems = (file: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, file), 'utf8')) as CorpusItem[];

/** The railroad corpus: the e2e fixtures and the harvested v12 spec strings. */
export async function railroadCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/railroad'), 'e2e')) {
    items.push(item);
  }
  return [...items, ...readItems('packages/conformance/corpus/railroad-v12-specs.json')];
}

/** The hand-written cases: the spec's quirks and rejected inputs, and the rules' corners. */
export function railroadCases(): CorpusItem[] {
  return readItems('packages/conformance/corpus/railroad-cases.json');
}

/** The recovery set (#610): documents with planted errors, per notation (`recovery.spec.ts`). */
export function railroadRecovery(): CorpusItem[] {
  return readItems('packages/conformance/corpus/railroad-recovery.json').map(({ id, source }) => ({
    id,
    source,
  }));
}

/** A gate corpus item: a source as written, or a generated copy of one (`variant`). */
export interface GateItem extends CorpusItem {
  variant?: 'CRLF' | 'commented';
}

/** The corpus, the cases, the recovery set, and a CRLF and a commented copy of each. */
export async function railroadGateCorpus(): Promise<GateItem[]> {
  const all = [...(await railroadCorpus()), ...railroadCases(), ...railroadRecovery()];
  return [
    ...all,
    ...all.map((item) => ({
      id: `${item.id} (CRLF)`,
      source: item.source.replace(/\n/g, '\r\n'),
      variant: 'CRLF' as const,
    })),
    ...all.map((item) => ({
      id: `${item.id} (commented)`,
      source: commented(item.source),
      variant: 'commented' as const,
    })),
  ];
}

/** v12's detectors, in its registration order (`railroadDetector.ts`, `ebnfDetector.ts`, …). */
const DETECTORS: readonly (readonly [RailroadNotation, RegExp])[] = [
  ['railroad', /^railroad-beta/i],
  ['railroadEbnf', /^railroad-ebnf-beta/i],
  ['railroadAbnf', /^railroad-abnf-beta/i],
  ['railroadPeg', /^railroad-peg-beta/i],
];

/**
 * The notation v12 reads `source` as, by its detectors (case-insensitive, no boundary) on the
 * body as core's preprocess finds it (after front matter), past blanks, comment lines and
 * directives; undefined when none matches. The gates check that v12 agrees: a routed source
 * reaches that notation's parser, and an unrouted one reaches none.
 */
export function notationOf(source: string): RailroadNotation | undefined {
  let text = source.slice(preprocess(source).bodyStart);
  for (;;) {
    const next = text.replace(/^\s+/, '').replace(/^%%\{[\s\S]*?\}%%|^%%[^\n]*/, '');
    if (next === text) break;
    text = next;
  }
  return DETECTORS.find(([, re]) => re.test(text))?.[0];
}
