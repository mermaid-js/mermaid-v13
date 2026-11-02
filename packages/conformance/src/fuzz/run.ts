/**
 * The flowchart fuzz run (R-SEC-7, R-TEST-8): seeded mutations of the e2e corpus, the v12 spec
 * strings and grammar-generated sentences (#21), each pushed through preprocess, the lexer,
 * the parse, then the public API (`prepare` + `renderSync`). A case fails on a crash (a
 * stage throwing, or an `INTERNAL` MermaidError), a hang (a case over `hangMs`) or output
 * that is not well-formed or breaks the allow-list (`assertInert`). Every failure carries the seed and case index that
 * reproduce it: `FUZZ_SEED=<seed> FUZZ_CASE=<index> pnpm --filter @mermaid-js/conformance fuzz`.
 */
import { SaxesParser } from 'saxes';
import { buildGenerator } from '@mermaid-js/gen-grammar';
import { preprocess } from '@mermaid-js/core/preprocess';
import { inertProblem } from '@mermaid-js/core/svg';
import { flowchartTokens, parseFlowchart } from '@mermaid-js/diagram-flowchart';
import { createMermaid, MermaidError } from 'mermaid';
import { clusterDivergences, type DivergenceCluster } from '../cluster.ts';
import { flowchartCorpus } from '../flowchart/grammar/corpus.ts';
import { PARITY_SUITES } from '../registry.ts';
import { runParity } from '../runner.ts';
import { learnSentenceModel, referenceParser } from '../flowchart/grammar/reference.ts';
import { FLOWCHART_FRAGMENTS, mutator, random } from './mutator.ts';

export type FuzzStage = 'preprocess' | 'lex' | 'parse' | 'render';
export type FuzzFailureKind = 'crash' | 'hang' | 'malformed' | 'allow-list';

export interface FuzzFailure {
  seed: number;
  index: number;
  kind: FuzzFailureKind;
  stage: FuzzStage;
  message: string;
  source: string;
}

export type FuzzOutcome = 'rendered' | 'rejected' | 'limit';

export interface FuzzReport {
  seed: number;
  count: number;
  outcomes: Record<FuzzOutcome, number>;
  failures: FuzzFailure[];
}

export interface FuzzOptions {
  seed: number;
  /** Mutated inputs to run. */
  count: number;
  /** Run only this case of the seed's sequence (to reproduce a failure). */
  only?: number;
  /** Grammar-generated sentences added to the seed corpus (default 300). */
  sentences?: number;
  /** A case slower than this is a hang (default 2,000 ms). */
  hangMs?: number;
  /** Mutated inputs longer than this are skipped (default 20,000; limits cover the rest). */
  maxLength?: number;
  /** Called before each case, e.g. to record it so a run killed by a real hang names it. */
  onCase?(index: number, source: string): void;
}

let seedCorpus: Promise<string[]> | undefined;

/** The seed corpus without sentences: e2e `.mmd` fixtures and the v12 spec strings. */
export function fuzzCorpus(): Promise<string[]> {
  seedCorpus ??= flowchartCorpus().then((items) => items.map((i) => i.source));
  return seedCorpus;
}

/** Sentences from the grammar (#21), learnt from the corpus; sentence seeds come from `seed`. */
export function grammarSentences(corpus: readonly string[], seed: number, count: number): string[] {
  if (count === 0) return [];
  const generator = buildGenerator(referenceParser(), learnSentenceModel(corpus));
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(generator.generate({ seed: seed * 7919 + i }).text);
  return out;
}

function wellFormed(svg: string): string | undefined {
  const parser = new SaxesParser({ xmlns: true });
  let problem: string | undefined;
  parser.on('error', (e) => (problem ??= e.message));
  parser.write(svg).close();
  return problem;
}

type CaseResult = FuzzOutcome | { kind: FuzzFailureKind; stage: FuzzStage; message: string };

let api: ReturnType<typeof createMermaid> | undefined;

/** One input through every stage, then through the public API. Never throws. */
export async function fuzzCase(source: string): Promise<CaseResult> {
  let stage: FuzzStage = 'preprocess';
  try {
    // The stages on their own first, so a crash is pinned to one of them.
    const pre = preprocess(source);
    stage = 'lex';
    flowchartTokens(source);
    stage = 'parse';
    parseFlowchart(source, { preprocessed: pre });
    stage = 'render';
    api ??= createMermaid();
    let svg: string;
    let themeStyle = false;
    try {
      const prepared = await api.prepare(source, { id: 'fuzz' });
      svg = api.renderSync(source, { id: 'fuzz' }).svg;
      // theme 'auto' writes a custom-properties-only <style> (R-THEME-8).
      themeStyle = String(prepared.config.theme) === 'auto';
    } catch (error) {
      if (!(error instanceof MermaidError) || error.code === 'INTERNAL') throw error;
      return error.code === 'LIMIT' ? 'limit' : 'rejected';
    }
    const malformed = wellFormed(svg);
    if (malformed) return { kind: 'malformed', stage, message: malformed };
    const unsafe = inertProblem(svg, { themeStyle });
    if (unsafe) return { kind: 'allow-list', stage, message: unsafe };
    return 'rendered';
  } catch (error) {
    const e = (
      error instanceof MermaidError && error.cause instanceof Error ? error.cause : error
    ) as Error;
    return { kind: 'crash', stage, message: `${e?.name}: ${e?.message}\n${e?.stack ?? ''}` };
  }
}

export async function fuzzFlowchart(options: FuzzOptions): Promise<FuzzReport> {
  const hangMs = options.hangMs ?? 2_000;
  const maxLength = options.maxLength ?? 20_000;
  const base = await fuzzCorpus();
  const corpus = [...base, ...grammarSentences(base, options.seed, options.sentences ?? 300)];
  const next = mutator(corpus, FLOWCHART_FRAGMENTS, random(options.seed));
  const report: FuzzReport = {
    seed: options.seed,
    count: 0,
    outcomes: { rendered: 0, rejected: 0, limit: 0 },
    failures: [],
  };
  const last = options.only ?? options.count - 1;
  for (let index = 0; index <= last; index++) {
    const source = next();
    if (options.only !== undefined && index !== options.only) continue;
    if (source.length > maxLength) continue;
    options.onCase?.(index, source);
    const started = performance.now();
    const result = await fuzzCase(source);
    const ms = performance.now() - started;
    report.count++;
    const fail = (kind: FuzzFailureKind, stage: FuzzStage, message: string) =>
      report.failures.push({ seed: options.seed, index, kind, stage, message, source });
    if (typeof result === 'string') {
      report.outcomes[result]++;
      if (ms > hangMs) fail('hang', 'render', `took ${Math.round(ms)} ms (bound ${hangMs} ms)`);
    } else {
      fail(result.kind, result.stage, result.message);
    }
  }
  return report;
}

/** One line per failure, with what reproduces it. */
export function formatFailure(f: FuzzFailure): string {
  return (
    `${f.kind} in ${f.stage}, seed ${f.seed} case ${f.index} ` +
    `(FUZZ_SEED=${f.seed} FUZZ_CASE=${f.index}): ${f.message.split('\n')[0]}\n` +
    `  source: ${JSON.stringify(f.source)}`
  );
}

export interface OracleFuzzReport {
  seed: number;
  count: number;
  divergent: number;
  /** Clusters of v12/v13 differences, each with up to 5 example sources. */
  clusters: (Omit<DivergenceCluster, 'ids'> & { examples: string[]; count: number })[];
}

/**
 * The informational half of the nightly run: mutated inputs through mermaid@12 and v13, the
 * differences clustered as the oracle-bump job does. Not a failure by itself: compare the
 * clusters with `FUZZ_DECISIONS` (decided.ts) and file or decide anything new.
 */
export async function fuzzOracle(seed: number, count: number): Promise<OracleFuzzReport> {
  const base = await fuzzCorpus();
  const corpus = [...base, ...grammarSentences(base, seed, 300)];
  const next = mutator(corpus, FLOWCHART_FRAGMENTS, random(seed ^ 0x5bd1e995));
  const items = Array.from({ length: count }, (_, i) => ({
    id: `fuzz/${seed}/${i}`,
    source: next(),
  }));
  const sources = new Map(items.map((i) => [i.id, i.source]));
  const report = await runParity({ adapters: PARITY_SUITES.map((s) => s.adapter), corpus: items });
  return {
    seed,
    count,
    divergent: report.unlisted.length,
    clusters: clusterDivergences(report.unlisted).map(({ ids, ...c }) => ({
      ...c,
      count: ids.length,
      examples: ids.slice(0, 5).map((id) => sources.get(id) ?? ''),
    })),
  };
}
