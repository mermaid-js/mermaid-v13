/**
 * The journey corpora: the e2e fixtures and harvested v12 spec strings, and the lexer gate's
 * set, which adds the cases (`corpus/journey-cases.json`: line-separator, edge and parser cases,
 * #302), long blank runs and code-unit cases, and a commented and a CRLF copy of every source.
 * The parity, grammar and layout specs of #302 run on it too.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpusFromDir, REPO_ROOT } from '../corpus.ts';
import type { CorpusItem } from '../types.ts';

/**
 * The parser and lexer cases (`corpus/journey-cases.json`): line-separator cases; the spec's T1
 * quirks (#290) and the cases the corpus misses (CRs, entities, comments the jison rules skip,
 * keyword boundaries and case, accessibility states at the end, `;`); and the parser cases of
 * #302 (the model conversions of v12's grammar actions and DB, statements without separators,
 * and errors). `journey-cases/parser case entity actors` holds `#…;` entities in actor names:
 * v12 sorted them by its entity placeholders (`ﬂ°lt¶ß`), v13 by the names as written (a listed
 * divergence, `divergences.json`).
 */
function journeyCases(): CorpusItem[] {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/journey-cases.json'), 'utf8')
  ) as CorpusItem[];
}

/** Long blank runs (pitfall 5), generated. */
function longBlankRuns(): CorpusItem[] {
  return [
    `journey\nT: 1${' '.repeat(5000)}\n${' \t'.repeat(3000)}U: 2`,
    `journey\naccTitle:${' \n'.repeat(3000)}x\naccDescr {${' '.repeat(5000)}}`,
    `journey\ntitle${'\n'.repeat(3000)}x`,
  ].map((source, k) => ({ id: `long blank runs ${k}`, source }));
}

/**
 * Every UTF-16 code unit at the start and in the middle of a task name, in a task's data, and
 * in a section name. `{`, `}` are left out of the middle of an accessibility description;
 * jison never stops on journey text, so one source per position holds them all.
 */
function everyCodeUnit(): CorpusItem[] {
  const units: string[] = [];
  for (let c = 0; c < 0x10000; c++) units.push(String.fromCharCode(c));
  return [
    {
      id: 'code units: line start',
      source: 'journey\n' + units.map((ch) => `${ch}a: 1`).join('\n'),
    },
    { id: 'code units: name', source: 'journey\n' + units.map((ch) => `a${ch}b: 1`).join('\n') },
    { id: 'code units: data', source: 'journey\n' + units.map((ch) => `a: 1${ch}b`).join('\n') },
    {
      id: 'code units: section',
      source: 'journey\n' + units.map((ch) => `section a${ch}b`).join('\n'),
    },
    {
      id: 'code units: after keyword',
      source:
        'journey\n' + units.map((ch) => `title${ch}x\nsection${ch}y\njourney${ch}z`).join('\n'),
    },
  ];
}

/**
 * `src` with nine comment lines after every line of the body, or, for a body of one or two
 * lines, one through the middle of what follows the header line (so detection still sees
 * `journey`). v12 removed them before lexing, so tokens must match across them.
 */
function commented(src: string): string {
  const head = /^---[\s\S]*?\n---[^\S\n]*\n/.exec(src)?.[0] ?? '';
  const body = src.slice(head.length);
  const lines = body.split('\n');
  if (lines.length > 2) return head + lines.join('\n' + '  %% c\n'.repeat(9));
  const first = (lines[0] ?? '').length + 1;
  const cut = Math.min(body.length, first + Math.floor((body.length - first) / 2));
  return head + body.slice(0, cut) + '\n%% cut\n' + body.slice(cut);
}

/** The journey corpus: the e2e fixtures and the v12 spec strings. */
export async function journeyCorpus(): Promise<CorpusItem[]> {
  const items: CorpusItem[] = [];
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/journey'), 'e2e')) {
    items.push(item);
  }
  const specs = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/conformance/corpus/journey-v12-specs.json'), 'utf8')
  ) as CorpusItem[];
  return [...items, ...specs];
}

/** The lexer gate's set: the corpus and the cases, each also commented and with CRLF. */
export async function journeyGateCorpus(): Promise<CorpusItem[]> {
  const all = [...(await journeyCorpus()), ...journeyCases(), ...longBlankRuns()];
  return [
    ...all,
    ...all.map((item) => ({ id: `${item.id} (commented)`, source: commented(item.source) })),
    ...all.map((item) => ({ id: `${item.id} (CRLF)`, source: item.source.replace(/\n/g, '\r\n') })),
    ...everyCodeUnit(),
  ];
}

/**
 * The gate's set without the every-code-unit sources, for the grammar file's dev-only lexer and
 * reference parser (the hand-written lexer is gated on those, `lexer-parity.spec.ts`).
 */
export async function journeyGrammarCorpus(): Promise<CorpusItem[]> {
  return (await journeyGateCorpus()).filter((item) => !item.id.startsWith('code units'));
}
