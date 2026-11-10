/**
 * The language-service bench (R-LANG-4, D90): one editing cycle on the committed 50k-character
 * flowchart, `fixtures/language/flowchart-50k.mmd`. A cycle is what an editor does per change:
 * `update` (a full re-parse) and then every query: diagnostics, folding ranges, semantic tokens,
 * and definition, references, prepareRename, rename, astAt and hover at a cursor on a node id,
 * and completions at the end of that id (a re-parse with a probe).
 * Budget: ≤ 15 ms per cycle (D156) on the reference runner. The CLI is `src/cli/language.ts`.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
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
  'completions',
  'hover',
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
  completions: number;
  hover: boolean;
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
  const completions = doc.completions(at + 2).length;
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

/**
 * CPU time of this process in ms (user + system): another process's load does not count.
 * The process and not the thread: V8 does much of a parse's garbage collection on helper
 * threads (on the hosted runner a bare parse costs a fifth to a third less CPU on the main
 * thread alone), and leaving that out would make the ratios a different measure.
 */
function cpuMs(): number {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

type Gc = (options: { type: 'minor' }) => void;
let collect: Gc | null | undefined;

/**
 * V8's `gc`: the global one under `--expose-gc`, else one from a new context after
 * `setFlagsFromString('--expose-gc')`, which turns it on for contexts made after it; null
 * where neither works.
 */
function minorGc(): Gc | null {
  if (collect === undefined) {
    let gc: unknown = (globalThis as { gc?: unknown }).gc;
    try {
      if (typeof gc !== 'function') {
        setFlagsFromString('--expose-gc');
        gc = runInNewContext('gc') as unknown;
      }
    } catch {
      gc = undefined;
    }
    collect = typeof gc === 'function' ? (gc as Gc) : null;
  }
  return collect;
}

/** Rounds run unmeasured before `bestOfEach` measures. */
const WARMUP_ROUNDS = 10;

/**
 * The best CPU time of each function over `runs` rounds, called alternately (a, b, a, b, …),
 * in ms and in the order given. For ratio checks that must hold on a loaded machine: CPU time
 * leaves out the time the worker waits for a core, and alternating lets the noise that stays
 * (caches) hit both sides alike.
 *
 * Two more sources of noise are taken out. First, ten unmeasured rounds run before any is
 * measured: V8 compiles hot code on helper threads, and `cpuUsage` bills that CPU to whatever
 * runs meanwhile. A cold process is still compiling the cycle's code when it starts measuring,
 * so its best cycle is a few percent dearer. Second, a minor GC runs before each measured
 * call, so that call pays for the garbage it makes itself. Without it, a call pays for
 * whatever the call before it left in the young generation, a different amount every round.
 * A major GC is not used: on the hosted runner the calls after one cost about three times as
 * much as the others.
 *
 * Last, every sample spans about as much CPU time as the dearest function's call: a cheaper
 * function is called that many times in a row and its sample is the mean of those calls (each
 * timed on its own, after its minor GC). On a loaded machine a core's speed changes from moment
 * to moment (other tenants, frequency, core types), and the best of many short calls lands in a
 * fast moment far more often than the best of as many long ones does. With samples of one call
 * each, the best bare parse of 60 read about 8% under the best window of four parses in a row
 * on a loaded machine, and packet's cycle read up to 4.9 parses on busy CI runners against best
 * runs of 4.0–4.1 on quiet ones. Taking each side's best over windows of the same length
 * compares like with like.
 */
export function bestOfEach(runs: number, ...fns: readonly ((run: number) => unknown)[]): number[] {
  let run = 0;
  const gc = minorGc();
  /** CPU ms of one call of `fn`, after a minor GC. */
  const timed = (fn: (run: number) => unknown): number => {
    gc?.({ type: 'minor' });
    const t = cpuMs();
    fn(run++);
    return cpuMs() - t;
  };
  // The warm-up rounds also give each function's cost, which sets its calls per sample.
  const warm = fns.map(() => Infinity);
  for (let i = 0; i < WARMUP_ROUNDS; i++)
    for (const [k, fn] of fns.entries()) warm[k] = Math.min(warm[k]!, timed(fn));
  const longest = Math.max(...warm);
  const calls = warm.map((ms) => Math.max(1, Math.round(longest / Math.max(ms, 1e-3))));
  const best = fns.map(() => Infinity);
  for (let i = 0; i < runs; i++) {
    for (const [k, fn] of fns.entries()) {
      let sum = 0;
      for (let c = 0; c < calls[k]!; c++) sum += timed(fn);
      best[k] = Math.min(best[k]!, sum / calls[k]!);
    }
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
