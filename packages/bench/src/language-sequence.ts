/**
 * The language-service bench (R-LANG-4, D90) for sequence: one editing cycle on the committed
 * 50k-character sequence diagram, `fixtures/language/sequence-50k.mmd`, as `language.ts` does
 * for flowchart. A cycle is `update` (a full re-parse) and then every query: diagnostics,
 * folding ranges, semantic tokens, and definition, references, prepareRename, rename, astAt and
 * hover at a cursor on the participant id `P7` where it is declared, and completions after a
 * message's arrow (a re-parse with a probe). Budget: ≤ 15 ms per cycle (D156) on the reference
 * runner. The CLI is `src/cli/language-sequence.ts`.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { DocumentSnapshot, LanguageService, Range } from '@mermaid-js/language-service';
import { FIXTURES_DIR } from './fixtures.ts';
import type { CycleAnswers } from './language.ts';
import { median } from './stats.ts';

export const SEQUENCE_FIXTURE = readFileSync(`${FIXTURES_DIR}language/sequence-50k.mmd`, 'utf8');

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
  'completions',
  'hover',
] as const;
type Stage = (typeof STAGES)[number];

/** The cursor: on `P7` where it is declared. */
const cursorOf = (text: string) => text.indexOf(' P7 as ') + 1;
/** Completions: right after the first message arrow's `+`, where a participant id goes. */
const completionAt = (text: string) => text.indexOf('+P') + 1;

/** One sequence cycle on `text`; `time` is called after each stage. */
export function sequenceCycle(
  service: LanguageService,
  text: string,
  time?: (stage: Stage) => void
): { doc: DocumentSnapshot; answers: CycleAnswers & { definition: Range | undefined } } {
  const at = cursorOf(text);
  const doc = service.update('bench:///sequence-50k.mmd', text);
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
  const renamed = doc.rename(at, 'renamedParticipant');
  time?.('rename');
  const ids = doc.astAt(at);
  for (const id of ids) doc.rangeOf(id);
  time?.('astAt');
  const completions = doc.completions(completionAt(text)).length;
  time?.('completions');
  const hover = doc.hover(at) !== undefined;
  time?.('hover');
  const renameEdits = 'edits' in renamed ? renamed.edits.length : -1;
  return {
    doc,
    answers: {
      definition,
      references,
      renameEdits,
      astAt: ids.length,
      folds,
      tokens,
      completions,
      hover,
    },
  };
}

export interface SequenceMeasurement {
  chars: number;
  runs: number;
  /** Median ms of the whole cycle. */
  total: number;
  /** Best ms of the whole cycle. */
  best: number;
  /** Median ms per stage. */
  stages: Record<Stage, number>;
}

/** Medians over `runs` cycles, after `warmup` unmeasured ones; `texts(i)` is run i's text. */
export function measureSequence(
  service: LanguageService,
  texts: (run: number) => string,
  { runs = 50, warmup = 10 } = {}
): SequenceMeasurement {
  for (let i = 0; i < warmup; i++) sequenceCycle(service, texts(i));
  const totals: number[] = [];
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    let last = start;
    sequenceCycle(service, texts(warmup + i), (stage) => {
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
    chars: texts(0).length,
    runs,
    total: median(totals) ?? 0,
    best: Math.min(...totals),
    stages,
  };
}
