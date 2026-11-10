/**
 * The language-service bench (R-LANG-4, D90) for block, as `language-venn.ts` does for venn: one
 * editing cycle on a generated 50k-character block diagram ({@link blockFixture}: composites
 * with a grid, labelled blocks of every common shape, a space and a block arrow each, a chain
 * with a labelled edge between them, and a `classDef`, `class` and `style` per tenth). A cycle
 * is `update` (a full re-parse) and then every query: diagnostics, folding ranges, semantic
 * tokens, and definition, references, prepareRename, rename (it goes through, so the service
 * parses the renamed text to check it, D92), astAt and hover at a cursor on the block `a7`
 * where it is declared, and completions after `a7 --> ` (a re-parse with a probe). Budget:
 * ≤ 15 ms per cycle (D156) on the reference runner. The CLI is `src/cli/language-block.ts`.
 */
import { performance } from 'node:perf_hooks';
import type { DocumentSnapshot, LanguageService } from '@mermaid-js/language-service';
import type { CycleAnswers } from './language.ts';
import { median } from './stats.ts';

/** The generated diagram: groups until it holds at least `chars` characters. */
export function blockFixture(chars = 50_000): string {
  const lines = ['block-beta', '  %% bench', '  columns 4'];
  let length = lines.join('\n').length;
  for (let i = 0; length < chars; i++) {
    const group = [
      `  block:g${i}["Group ${i}"]:2`,
      '    columns 3',
      `    a${i}["Node ${i}"] b${i}{"Choice ${i}"} c${i}(("C${i}"))`,
      '    space',
      `    d${i}<["Go"]>(right, down)`,
      '  end',
      `  e${i}[("Store ${i}")]:2`,
      `  a${i} --> b${i} -- "yes" --> c${i}`,
      `  c${i} -.-> e${i}`,
    ];
    if (i % 10 === 0) {
      group.push(
        `  classDef hot${i} fill:#f96,stroke:#333`,
        `  class a${i},e${i} hot${i}`,
        `  style b${i} fill:#9f6`
      );
    }
    lines.push(...group);
    length += group.join('\n').length + 1;
  }
  return `${lines.join('\n')}\n`;
}

export const BLOCK_FIXTURE = blockFixture();

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

/** The cursor: on the block `a7` where it is declared. */
const cursorOf = (text: string) => text.indexOf('    a7[') + 4;
/** Completions: right after `a7 --> `, where a block id goes. */
const completionAt = (text: string) => text.indexOf('  a7 --> ') + 9;

/** One block cycle on `text`; `time` is called after each stage. */
export function blockCycle(
  service: LanguageService,
  text: string,
  time?: (stage: Stage) => void
): { doc: DocumentSnapshot; answers: CycleAnswers } {
  const at = cursorOf(text);
  const doc = service.update('bench:///block-50k.mmd', text);
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
  const renamed = doc.rename(at, 'renamedBlock');
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

export interface BlockMeasurement {
  chars: number;
  runs: number;
  /** Median ms of the whole cycle. */
  total: number;
  /** Best ms of the whole cycle. */
  best: number;
  /** Median ms per stage. */
  stages: Record<Stage, number>;
  /** The last cycle's answers, to show every query did its work. */
  answers: CycleAnswers;
}

/** Medians over `runs` cycles, after `warmup` unmeasured ones; `texts(i)` is run i's text. */
export function measureBlock(
  service: LanguageService,
  texts: (run: number) => string,
  { runs = 50, warmup = 10 } = {}
): BlockMeasurement {
  for (let i = 0; i < warmup; i++) blockCycle(service, texts(i));
  const totals: number[] = [];
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));
  let answers: CycleAnswers | undefined;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    let last = start;
    answers = blockCycle(service, texts(warmup + i), (stage) => {
      const now = performance.now();
      perStage.get(stage)!.push(now - last);
      last = now;
    }).answers;
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
    answers: answers!,
  };
}
