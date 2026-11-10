/**
 * The language-service bench (R-LANG-4, D90) for agentflow, as `language-venn.ts` does for venn:
 * one editing cycle on a generated 50k-character agentflow ({@link agentflowFixture}: flows of six
 * `@{ shape }` nodes, one of each kind, chained with a sequence link, a failure link and a
 * reference link, a link from flow to flow, a connector per tenth flow, and a `classDef` and
 * `class` per tenth). A cycle is `update` (a full re-parse) and then every query: diagnostics,
 * folding ranges, semantic tokens, and definition, references, prepareRename, rename (it goes
 * through, so the service parses the renamed text to check it, D92), astAt and hover at a cursor
 * on the node `t7` where it is declared, and completions after `t7 --> ` (a re-parse with a
 * probe). Budget: ≤ 15 ms per cycle (D156) on the reference runner. The CLI is
 * `src/cli/language-agentflow.ts`.
 */
import { performance } from 'node:perf_hooks';
import type { DocumentSnapshot, LanguageService } from '@mermaid-js/language-service';
import type { CycleAnswers } from './language.ts';
import { median } from './stats.ts';

/** The generated diagram: flows until it holds at least `chars` characters. */
export function agentflowFixture(chars = 50_000): string {
  const lines = ['agentflow-beta LR', '  %% bench'];
  let length = lines.join('\n').length;
  for (let i = 0; length < chars; i++) {
    const group = [
      `  flow f${i}["Flow ${i}"]`,
      `    i${i}["ticket ${i}"]@{ shape: input }`,
      `    t${i}["plan ${i}"]@{ shape: task }`,
      `    d${i}["ok ${i}?"]@{ shape: decision }`,
      `    u${i}["search_${i}"]@{ shape: tool }`,
      `    r${i}["Notes ${i}"]@{ shape: refdoc }`,
      `    a${i}["act ${i}"]@{ shape: action }`,
      `    i${i} --> t${i} --> d${i}`,
      `    d${i} -->|"yes"| u${i}`,
      `    d${i} --x a${i}`,
      `    u${i} -.- r${i}`,
      '  end',
    ];
    if (i > 0) group.push(`  f${i - 1} --> f${i}`);
    if (i % 10 === 0) {
      group.push(
        `  connector c${i}["API ${i}"]`,
        `  classDef hot${i} fill:#f96,stroke:#333`,
        `  class t${i},a${i} hot${i}`
      );
    }
    lines.push(...group);
    length += group.join('\n').length + 1;
  }
  return `${lines.join('\n')}\n`;
}

export const AGENTFLOW_FIXTURE = agentflowFixture();

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

/** The cursor: on the node `t7` where it is declared. */
const cursorOf = (text: string) => text.indexOf('    t7[') + 4;
/** Completions: right after `t7 --> `, where a node id goes. */
const completionAt = (text: string) => text.indexOf(' t7 --> ') + 8;

/** One agentflow cycle on `text`; `time` is called after each stage. */
export function agentflowCycle(
  service: LanguageService,
  text: string,
  time?: (stage: Stage) => void
): { doc: DocumentSnapshot; answers: CycleAnswers } {
  const at = cursorOf(text);
  const doc = service.update('bench:///agentflow-50k.mmd', text);
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

export interface AgentflowMeasurement {
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
export function measureAgentflow(
  service: LanguageService,
  texts: (run: number) => string,
  { runs = 50, warmup = 10 } = {}
): AgentflowMeasurement {
  for (let i = 0; i < warmup; i++) agentflowCycle(service, texts(i));
  const totals: number[] = [];
  const perStage = new Map<Stage, number[]>(STAGES.map((s) => [s, []]));
  let answers: CycleAnswers | undefined;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    let last = start;
    answers = agentflowCycle(service, texts(warmup + i), (stage) => {
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
