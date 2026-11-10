/** Existing repository production size budgets, independent of harness instrumentation. */
import {
  checkBudget,
  flowchartClosureSize,
  measureStaticClosure,
  readSizeBudget,
} from '../../packages/bench/src/size-budget.ts';
const budget = readSizeBudget();
const core = await measureStaticClosure(budget.core.entry);
const loaded = flowchartClosureSize(core.bundle);
const checks = {
  core: checkBudget(core.size, budget.core),
  loaded: checkBudget(loaded, budget.loaded),
};
console.log(JSON.stringify({ checks, core: core.size, loaded }, null, 2));
if (Object.values(checks).some((check) => !check.ok)) process.exitCode = 1;
