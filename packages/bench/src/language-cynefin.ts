/**
 * The language-service bench (R-LANG-4, D90) for cynefin, as `language-sequence.ts` does for
 * sequence: one editing cycle on the committed 50k-character cynefin diagram,
 * `fixtures/language/cynefin-50k.mmd` (the five domains, each declared once, with 160 items,
 * then transitions between them). A cycle is `update` (a full re-parse) and then every query: diagnostics,
 * folding ranges, semantic tokens, and definition, references, prepareRename, rename (refused:
 * the names are fixed, D367), astAt and hover at a cursor on `complex` where its block starts,
 * and completions after a transition's arrow (a re-parse with a probe). Budget: ≤ 15 ms per
 * cycle (D156) on the reference runner. The CLI is `src/cli/language-cynefin.ts`.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { DocumentSnapshot, LanguageService } from '@mermaid-js/language-service';
import { FIXTURES_DIR } from './fixtures.ts';
import type { CycleAnswers } from './language.ts';
import { median } from './stats.ts';

export const CYNEFIN_FIXTURE = readFileSync(`${FIXTURES_DIR}language/cynefin-50k.mmd`, 'utf8');

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

/** The cursor: on `complex` where its block starts. */
const cursorOf = (text: string) => text.indexOf('\n  complex\n') + 3;
/** Completions: right after the first transition's arrow, where a domain name goes. */
const completionAt = (text: string) => text.indexOf(' --> ') + 5;

/** One cynefin cycle on `text`; `time` is called after each stage. */
export function cynefinCycle(
  service: LanguageService,
  text: string,
  time?: (stage: Stage) => void
): { doc: DocumentSnapshot; answers: CycleAnswers } {
  const at = cursorOf(text);
  const doc = service.update('bench:///cynefin-50k.mmd', text);
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
  const renamed = doc.rename(at, 'renamedDomain');
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

export interface CynefinMeasurement {
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
export function measureCynefin(
  service: LanguageService,
  texts: (run: number) => string,
  { runs = 50, warmup = 10 } = {}
): CynefinMeasurement {
  for (let i = 0; i < warmup; i++) cynefinCycle(service, texts(i));
  const totals: number[] = [];
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    let last = start;
    cynefinCycle(service, texts(warmup + i), (stage) => {
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
