/**
 * Bench harness: fixtures, per-stage timing, size and speed gates (R-PERF-1…7, R-PERF-9,
 * R-TEST-7; DESIGN §14). Run it with `pnpm --filter @mermaid-js/bench bench`.
 */
export { loadFixtures } from './fixtures.ts';
export type { Fixture, FixtureSet, Tier } from './fixtures.ts';
export { LIMITS, evaluateGates, resolveMode, speedup, stageRatios } from './gates.ts';
export type {
  GateId,
  GateInput,
  GateMode,
  GateModeSetting,
  GateOutcome,
  GateResult,
  GateStatus,
} from './gates.ts';
export { formatMarkdown } from './markdown.ts';
export { STAGES, baselineFrom } from './report.ts';
export type * from './report.ts';
export { benchDefine, bundle } from './build.ts';
export type { Bundle, BundleOptions } from './build.ts';
export { detectPipeline } from './pipeline.ts';
export {
  FLOWCHART_ENTRY,
  SIZE_BUDGET_FILE,
  checkBudget,
  chunkOf,
  closureSize,
  flowchartClosureSize,
  measureStaticClosure,
  readSizeBudget,
} from './size-budget.ts';
export type { Budget, BudgetCheck, ClosureSize, SizeBudget } from './size-budget.ts';
