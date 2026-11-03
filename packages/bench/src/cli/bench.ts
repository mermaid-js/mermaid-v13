/**
 * Headless benchmark: builds the runner site, renders the fixtures through every selected
 * renderer in each environment, writes dist/reports/<stamp>.{json,md} and applies the gates.
 *
 *   pnpm --filter @mermaid-js/bench bench
 *     [--env browser,node]
 *     [--renderers v13,v13-stages,v13-base,v12-frozen,v12-current,pele] [--base <ref>]
 *     [--compare-rounds 20] [--compare-reps 10] [--v12-rounds 3]
 *     [--compare-renderers v13,v13-base,v12-frozen,pele]
 *     [--compare id,id,...] [--node-metric auto|time|instructions]
 *     [--set corpus,pele] [--filter text] [--tiers tiny,regular,large,huge] [--reps 10]
 *     [--budget 1000] [--timeout 30] [--headed] [--lift-limits false] [--strip false]
 *     [--mode auto|report|enforce] [--report-only speed,...] [--update-baseline]
 *
 * Environments (`--env`, default both): `browser` renders in Chromium through Playwright, to an
 * SVG in the document with layout forced; every gate reads it. `node` renders in a Node child
 * process per renderer, to the SVG string; it is reported only, and Mermaid 12 (which needs a
 * DOM) is not run there.
 *
 * Two phases per environment. The corpus pass runs the selected fixtures (`--set`, `--tiers`,
 * `--filter`) through `--renderers`, alternating; every gate reads it. The comparison
 * (`compare.ts`) then measures a few chosen diagrams over `--compare-rounds` rounds of fresh
 * sessions, with Mermaid 12 in only `--v12-rounds` of them; the PR comment shows it.
 * `--compare-rounds 0` turns it off. In Node the comparison counts CPU instructions instead of
 * timing when `perf` can (`instruction-counts.ts`; BENCH_PERF names the binary), as they are far
 * steadier; `--node-metric time` keeps timing.
 *
 * `v13-base` is v13 built from `--base` (else BENCH_BASE_REF, else origin/mermaid-v13): the
 * branch a PR merges into. CI passes the PR merge commit's first parent.
 *
 * BENCH_COMMIT names the commit the report is for (CI: the PR head, as HEAD is a merge commit).
 * BENCH_RUNNER names the machine for baselines (O-4); BENCH_GATES sets the default mode;
 * BENCH_REPORT_ONLY lists gates that are reported but never fail the job.
 */
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { asciiSize } from '../ascii-size.ts';
import { DEFAULT_BASE_REF, resolveRef } from '../base.ts';
import { runnerId } from '../baseline.ts';
import { COMPARE_DIAGRAMS, compareRounds } from '../compare.ts';
import { buildSite, driveBrowser, openBrowserSession, serve } from '../driver.ts';
import { INSTRUCTION_DEFAULTS, countInstructions, findPerf } from '../instruction-counts.ts';
import { loadFixtures } from '../fixtures.ts';
import { detectPipeline } from '../pipeline.ts';
import { driveNode, openNodeSession } from '../node-driver.ts';
import type { BenchEnv, BenchReport, CompareDiagram, RendererId } from '../report.ts';
import { ENVS } from '../report.ts';
import { classifyFixtures } from '../support.ts';
import { parseArgs } from './args.ts';
import { gate, modeSetting, publish, reportOnlyGates } from './output.ts';

const ALL: RendererId[] = ['v13', 'v13-stages', 'v13-base', 'v12-frozen', 'v12-current', 'pele'];
const args = parseArgs(process.argv.slice(2));
const log = (line: string) => process.stdout.write(line + '\n');
const baseRef = args.get('base') ?? process.env.BENCH_BASE_REF ?? DEFAULT_BASE_REF;
const asked = args.list('renderers') as RendererId[] | undefined;
for (const r of asked ?? [])
  if (!ALL.includes(r)) throw new Error(`Unknown renderer "${r}" (${ALL.join(', ')})`);
/**
 * Asked for by name, v13-base always runs (and reports why when its ref is missing). In the
 * default "every renderer" set it runs only when its ref exists here: a shallow release
 * checkout has no base branch to compare with.
 */
let baseMissing: string | undefined;
try {
  resolveRef(baseRef);
} catch (e) {
  baseMissing = (e as Error).message;
}
/** A default list keeps v13-base only when its ref exists; a list asked for by name keeps it. */
const withoutMissingBase = (list: RendererId[]): RendererId[] =>
  baseMissing === undefined ? list : list.filter((r) => r !== 'v13-base');
if (baseMissing !== undefined && (!asked || !args.list('compare-renderers')))
  log(`v13-base skipped: ${baseMissing}`);
const renderers = asked ?? withoutMissingBase(ALL);

// The comparison: a few diagrams over many rounds of fresh sessions (compare.ts).
const COMPARE_DEFAULT: RendererId[] = ['v13', 'v13-base', 'v12-frozen', 'pele'];
const askedCompare = args.list('compare-renderers') as RendererId[] | undefined;
for (const r of askedCompare ?? [])
  if (!ALL.includes(r)) throw new Error(`Unknown renderer "${r}" (${ALL.join(', ')})`);
const compareRenderers = askedCompare ?? withoutMissingBase(COMPARE_DEFAULT);
const compareRoundCount = args.num('compare-rounds', 20);
const v12Rounds = args.num('v12-rounds', 3);
/** Warm samples per diagram in the comparison, apart from the corpus pass's `--reps`. */
const compareReps = args.num('compare-reps', 10);
const compareIds = args.list('compare');
const compareSet: CompareDiagram[] = compareIds
  ? compareIds.map((id) => COMPARE_DIAGRAMS.find((d) => d.id === id) ?? { id, label: id })
  : COMPARE_DIAGRAMS;
const envs = (args.list('env') ?? [...ENVS]) as BenchEnv[];
for (const e of envs)
  if (!ENVS.includes(e)) throw new Error(`Unknown env "${e}" (${ENVS.join(', ')})`);
// Mermaid 12 needs a DOM, so it only runs in the browser.
const BROWSER_ONLY: RendererId[] = ['v12-frozen', 'v12-current'];
const sets = args.list('set');
const tiers = args.list('tiers');
const filter = args.get('filter');
const { supported: fixtures, unsupported } = classifyFixtures(
  loadFixtures().filter(
    (f) =>
      (!sets || sets.includes(f.set)) &&
      (!tiers || tiers.includes(f.tier)) &&
      (!filter || f.id.includes(filter))
  )
);
const allFixtures = loadFixtures();
const compareDiagrams = compareSet.map((diagram) => {
  const fixture = allFixtures.find((f) => f.id === diagram.id);
  if (!fixture) throw new Error(`Comparison diagram "${diagram.id}" is not a fixture`);
  return { diagram, fixture };
});
const comparing = compareRoundCount > 0 && compareRenderers.includes('v13');
const options = {
  reps: args.num('reps', 10),
  budgetMs: args.num('budget', 1000),
  timeoutMs: args.num('timeout', 30) * 1000,
  liftLimits: args.get('lift-limits') !== 'false',
  strip: args.get('strip') !== 'false',
};
const setting = modeSetting(args.get('mode'));
const reportOnly = reportOnlyGates(args.get('report-only'));
// "Render works" is decided in Node through the public API, independent of the browser run.
const pipeline = await detectPipeline(await import('mermaid'));
log(`Pipeline ${pipeline.present ? 'present' : 'missing'}: ${pipeline.reason}`);
if (unsupported.length > 0)
  log(`Not run, no v13 package: ${unsupported.map((u) => `${u.id} (${u.type})`).join(', ')}`);

const needsBase =
  renderers.includes('v13-base') || (comparing && compareRenderers.includes('v13-base'));
const site = await buildSite(needsBase ? { baseRef } : {});
if (site.base) log(`v13-base: ${baseRef} = ${site.base.version}`);
const short = (rev: string): string | undefined => {
  try {
    return execFileSync('git', ['rev-parse', '--short', rev], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
};
// On a PR, CI checks out a merge of the PR into its base, so HEAD is not the commit GitHub shows
// for the PR. BENCH_COMMIT names that commit (the PR head); HEAD is kept as what was built.
const head = short('HEAD');
const named = process.env.BENCH_COMMIT || undefined;
const commit = named === undefined ? head : (short(named) ?? named.slice(0, 7));
const mergeCommit = named !== undefined && head !== undefined && head !== commit ? head : undefined;
const report: BenchReport = {
  schema: 1,
  createdAt: new Date().toISOString(),
  runner: runnerId(),
  ...(commit !== undefined && { commit }),
  ...(mergeCommit !== undefined && { mergeCommit }),
  options: {
    ...options,
    envs,
    renderers,
    ...(comparing && {
      compare: {
        renderers: compareRenderers,
        rounds: compareRoundCount,
        reps: compareReps,
        v12Rounds,
        diagrams: compareSet.map((d) => d.id),
      },
    }),
    ...(needsBase && { base: baseRef }),
    fixtures: fixtures.length,
    sets,
    tiers,
    filter,
  },
  pipeline,
  unsupported,
  // R-ASCII-9: the chunks only a text render loads, from the production build's import graph.
  asciiSize: asciiSize(site.v13),
  renderers: [],
};

if (envs.includes('browser')) {
  const server = await serve(site);
  const browser = await chromium.launch({ headless: !args.flag('headed') });
  try {
    report.browser = `chromium ${browser.version()}`;
    report.renderers = await driveBrowser({
      browser,
      server,
      site,
      renderers,
      fixtures,
      ...options,
      log,
    });
    if (comparing) {
      const browserCompare = await compareRounds({
        renderers: compareRenderers,
        diagrams: compareDiagrams,
        rounds: compareRoundCount,
        someRounds: v12Rounds,
        open: (renderer) =>
          openBrowserSession({
            browser,
            server,
            site,
            renderer,
            fixtures: compareDiagrams.map((d) => d.fixture),
            ...options,
            reps: compareReps,
            log,
          }),
        log,
        env: 'browser',
      });
      report.compare = { diagrams: compareSet, ...report.compare, browser: browserCompare };
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

if (envs.includes('node')) {
  report.node = { runtime: `node ${process.version}`, renderers: [] };
  const inNode = renderers.filter((r) => !BROWSER_ONLY.includes(r));
  const skipped = renderers.filter((r) => BROWSER_ONLY.includes(r));
  if (skipped.length > 0) log(`Not run in Node (needs a DOM): ${skipped.join(', ')}`);
  report.node.renderers = await driveNode({ site, renderers: inNode, fixtures, ...options, log });
  // Instruction counts where the machine has hardware counters (--node-metric auto|time|instructions).
  const metric = args.get('node-metric') ?? 'auto';
  if (!['auto', 'time', 'instructions'].includes(metric))
    throw new Error(`Unknown --node-metric "${metric}" (auto, time or instructions)`);
  const perf = metric === 'time' ? undefined : findPerf();
  if (metric === 'instructions' && !perf)
    throw new Error('--node-metric instructions: no perf that can count instructions here');
  if (comparing && perf) {
    report.compare = {
      diagrams: compareSet,
      ...report.compare,
      node: countInstructions({
        perf,
        site,
        renderers: compareRenderers.filter((r) => !BROWSER_ONLY.includes(r)),
        diagrams: compareDiagrams,
        ...INSTRUCTION_DEFAULTS,
        log,
      }),
    };
  } else if (comparing) {
    if (metric === 'auto') log('Node comparison by time: no perf that can count instructions here');
    const nodeCompare = await compareRounds({
      renderers: compareRenderers.filter((r) => !BROWSER_ONLY.includes(r)),
      diagrams: compareDiagrams,
      rounds: compareRoundCount,
      someRounds: v12Rounds,
      open: (renderer) =>
        openNodeSession({
          site,
          renderer,
          fixtures: compareDiagrams.map((d) => d.fixture),
          ...options,
          reps: compareReps,
          log,
        }),
      log,
      env: 'Node',
    });
    report.compare = { diagrams: compareSet, ...report.compare, node: nodeCompare };
  }
}

// Every gate reads the browser runs; without them they can only be reported.
if (!envs.includes('browser') && setting !== 'report')
  log('No browser run: the gates are reported, not enforced.');
const outcome = gate(report, envs.includes('browser') ? setting : 'report', reportOnly);
publish(report, outcome, { updateBaseline: args.flag('update-baseline'), write: true });
process.exitCode = outcome.exitCode;
