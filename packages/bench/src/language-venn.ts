/**
 * The language-service bench (R-LANG-4, D90) for venn, as `language-cynefin.ts` does for
 * cynefin: one editing cycle on the committed 50k-character venn diagram,
 * `fixtures/language/venn-50k.mmd` (274 labelled sets with indented text nodes, the overlap of
 * each with the one before, a style per set and a text node per overlap). A cycle is `update`
 * (a full re-parse) and then every query: diagnostics, folding ranges, semantic tokens, and
 * definition, references, prepareRename, rename (it goes through, so the service parses the
 * renamed text to check it, D92), astAt and hover at a cursor on the set `S3` where it is
 * declared, and completions after `union ` (a re-parse with a probe). Budget: ≤ 15 ms per cycle
 * (D156) on the reference runner. The CLI is `src/cli/language-venn.ts`.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { DocumentSnapshot, LanguageService } from '@mermaid-js/language-service';
import { FIXTURES_DIR } from './fixtures.ts';
import type { CycleAnswers } from './language.ts';
import { median } from './stats.ts';

export const VENN_FIXTURE = readFileSync(`${FIXTURES_DIR}language/venn-50k.mmd`, 'utf8');

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

/** The cursor: on the set `S3` where it is declared. */
const cursorOf = (text: string) => text.indexOf('\n  set S3[') + 7;
/** Completions: right after the first `union `, where a declared set goes. */
const completionAt = (text: string) => text.indexOf('\n  union ') + 9;

/** One venn cycle on `text`; `time` is called after each stage. */
export function vennCycle(
  service: LanguageService,
  text: string,
  time?: (stage: Stage) => void
): { doc: DocumentSnapshot; answers: CycleAnswers } {
  const at = cursorOf(text);
  const doc = service.update('bench:///venn-50k.mmd', text);
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
  const renamed = doc.rename(at, 'renamedSet');
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

export interface VennMeasurement {
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
export function measureVenn(
  service: LanguageService,
  texts: (run: number) => string,
  { runs = 50, warmup = 10 } = {}
): VennMeasurement {
  for (let i = 0; i < warmup; i++) vennCycle(service, texts(i));
  const totals: number[] = [];
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    let last = start;
    vennCycle(service, texts(warmup + i), (stage) => {
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
