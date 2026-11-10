/**
 * The language-service bench (R-LANG-4, D90) for C4, as `language-venn.ts` does for venn: one
 * editing cycle on the committed 50k-character C4Container, `fixtures/language/c4-50k.mmd` (#543's
 * document: a person, then 72 `System_Boundary` blocks of 6 containers, each followed by 5
 * relations between them, a `Rel(user, …)` to it and an `UpdateRelStyle`; one comment line for
 * `typing`). A cycle is `update` (a full re-parse) and then every query: diagnostics, folding
 * ranges, semantic tokens, and definition, references, prepareRename, rename (it goes through,
 * so the service parses the renamed text to check it, D92), astAt and hover at a cursor in the
 * alias `c3_2` where it is defined, and completions in the last `Rel(user, ` (a re-parse with a
 * probe; the aliases a relation end can name). Budget: ≤ 15 ms per cycle (D156) on the
 * reference runner. The CLI is `src/cli/language-c4.ts`.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { DocumentSnapshot, LanguageService } from '@mermaid-js/language-service';
import { FIXTURES_DIR } from './fixtures.ts';
import type { CycleAnswers } from './language.ts';
import { median } from './stats.ts';

export const C4_FIXTURE = readFileSync(`${FIXTURES_DIR}language/c4-50k.mmd`, 'utf8');

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

/** The cursor: in the alias `c3_2` where its container defines it. */
const cursorOf = (text: string) => text.indexOf('Container(c3_2,') + 'Container('.length + 1;
/** Completions: right after the last `Rel(user, `, where a relation's other end goes. */
const completionAt = (text: string) => text.lastIndexOf('Rel(user, ') + 'Rel(user, '.length;

/** One c4 cycle on `text`; `time` is called after each stage. */
export function c4Cycle(
  service: LanguageService,
  text: string,
  time?: (stage: Stage) => void
): { doc: DocumentSnapshot; answers: CycleAnswers } {
  const at = cursorOf(text);
  const doc = service.update('bench:///c4-50k.mmd', text);
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
  const renamed = doc.rename(at, 'renamedC');
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

export interface C4Measurement {
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
export function measureC4(
  service: LanguageService,
  texts: (run: number) => string,
  { runs = 50, warmup = 10 } = {}
): C4Measurement {
  for (let i = 0; i < warmup; i++) c4Cycle(service, texts(i));
  const totals: number[] = [];
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    let last = start;
    c4Cycle(service, texts(warmup + i), (stage) => {
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
