/**
 * The language-service bench (R-LANG-4, D90): one editing cycle on the committed 50k-character
 * flowchart, `fixtures/language/flowchart-50k.mmd`. A cycle is what an editor does per change:
 * `update` (a full re-parse) and then every query: diagnostics, folding ranges, semantic tokens,
 * and definition, references, prepareRename, rename and astAt at a cursor on a node id.
 * Budget: ≤ 15 ms per cycle (D156) on the reference runner. The CLI is `src/cli/language.ts`.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { DocumentSnapshot, LanguageService, Range } from '@mermaid-js/language-service';
import { FIXTURES_DIR } from './fixtures.ts';
import { median } from './stats.ts';

export const LANGUAGE_FIXTURE = readFileSync(`${FIXTURES_DIR}language/flowchart-50k.mmd`, 'utf8');
export const LANGUAGE_BUDGET_MS = 15;

/** The stages of a cycle, in order. */
const STAGES = [
  'update',
  'diagnostics',
  'foldingRanges',
  'semanticTokens',
  'definition',
  'references',
  'prepareRename',
  'rename',
  'astAt',
] as const;
type Stage = (typeof STAGES)[number];

/** The cursor: on the node id `n7` where it is first written. */
const cursorOf = (text: string) => text.indexOf('\n    n7') + 5;

export interface CycleAnswers {
  definition: Range | undefined;
  references: number;
  renameEdits: number;
  astAt: number;
  folds: number;
  tokens: number;
}

/**
 * One cycle on `text`; `time` is called after each stage. Returns the snapshot and a summary
 * of the answers, so a bench run can show that every query did its work.
 */
export function cycle(
  service: LanguageService,
  text: string,
  time?: (stage: Stage) => void
): { doc: DocumentSnapshot; answers: CycleAnswers } {
  const at = cursorOf(text);
  const doc = service.update('bench:///flowchart-50k.mmd', text);
  time?.('update');
  doc.diagnostics();
  time?.('diagnostics');
  const folds = doc.foldingRanges().length;
  time?.('foldingRanges');
  const tokens = doc.semanticTokens().length;
  time?.('semanticTokens');
  const definition = doc.definition(at);
  time?.('definition');
  const references = doc.references(at).length;
  time?.('references');
  doc.prepareRename(at);
  time?.('prepareRename');
  const renamed = doc.rename(at, 'renamedNode');
  time?.('rename');
  const ids = doc.astAt(at);
  for (const id of ids) doc.rangeOf(id);
  time?.('astAt');
  const renameEdits = 'edits' in renamed ? renamed.edits.length : -1;
  return {
    doc,
    answers: { definition, references, renameEdits, astAt: ids.length, folds, tokens },
  };
}

/**
 * Texts for successive runs: the fixture with one character of its first comment changed per
 * run, as typing would, so no run sees the text of the one before.
 */
export function typing(text: string): (run: number) => string {
  const at = text.indexOf('%%') + 3;
  return (run) => text.slice(0, at) + String.fromCharCode(97 + (run % 26)) + text.slice(at + 1);
}

/** The best time of `runs` calls of `fn(run)`, in ms. */
export function bestOf(runs: number, fn: (run: number) => unknown): number {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn(i);
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

export interface LanguageMeasurement {
  chars: number;
  runs: number;
  /** Median ms of the whole cycle. */
  total: number;
  /** Best ms of the whole cycle. */
  best: number;
  /** Median ms per stage. */
  stages: Record<Stage, number>;
}

/** Medians over `runs` cycles, after `warmup` unmeasured ones. */
export function measureLanguage(
  service: LanguageService,
  { runs = 50, warmup = 10, text = LANGUAGE_FIXTURE } = {}
): LanguageMeasurement {
  const texts = typing(text);
  for (let i = 0; i < warmup; i++) cycle(service, texts(i));
  const totals: number[] = [];
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    let last = start;
    cycle(service, texts(warmup + i), (stage) => {
      const now = performance.now();
      perStage.get(stage)!.push(now - last);
      last = now;
    });
    totals.push(last - start);
  }
  const stages = Object.fromEntries(
    STAGES.map((s) => [s, median(perStage.get(s)!) ?? 0])
  ) as Record<Stage, number>;
  return {
    chars: text.length,
    runs,
    total: median(totals) ?? 0,
    best: Math.min(...totals),
    stages,
  };
}
