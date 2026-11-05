/**
 * The full browser bench (release and nightly): builds the runner site, renders the fixtures in
 * Chromium through every selected renderer, alternating, writes dist/reports/<stamp>.{json,md}
 * and applies the gates. Pull requests run the shorter `pr` check (`cli/pr.ts`) instead.
 *
 *   pnpm --filter @mermaid-js/bench bench
 *     [--renderers v13,v13-stages,v13-base,v12-frozen,v12-current,pele] [--base <ref>]
 *     [--set corpus,pele] [--filter text] [--tiers tiny,regular,large,huge] [--reps 10]
 *     [--budget 1000] [--timeout 30] [--headed] [--lift-limits false] [--strip false]
 *     [--mode auto|report|enforce] [--report-only speed,...] [--update-baseline]
 *
 * `v13-base` is v13 built from `--base` (else BENCH_BASE_REF, else origin/mermaid-v13). In the
 * default "every renderer" set it runs only when that ref exists here.
 *
 * BENCH_COMMIT names the commit the report is for; BENCH_RUNNER names the machine for baselines
 * (O-4); BENCH_GATES sets the default mode; BENCH_REPORT_ONLY lists gates that are reported but
 * never fail the job.
 */
import { chromium } from '@playwright/test';
import { asciiSize, asciiSizeByType } from '../ascii-size.ts';
import { DEFAULT_BASE_REF, resolveRef } from '../base.ts';
import { runnerId } from '../baseline.ts';
import { buildSite, driveBrowser, serve } from '../driver.ts';
import { loadFixtures } from '../fixtures.ts';
import { detectPipeline } from '../pipeline.ts';
import type { BenchReport, RendererId } from '../report.ts';
import { closureSize } from '../size-budget.ts';
import { classifyFixtures } from '../support.ts';
import { parseArgs } from './args.ts';
import { commitInfo, gate, modeSetting, publish, reportOnlyGates } from './output.ts';

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
function defaultRenderers(): RendererId[] {
  try {
    resolveRef(baseRef);
    return ALL;
  } catch (e) {
    log(`v13-base skipped: ${(e as Error).message}`);
    return ALL.filter((r) => r !== 'v13-base');
  }
}
const renderers = asked ?? defaultRenderers();
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

const site = await buildSite(renderers.includes('v13-base') ? { baseRef } : {});
if (site.base) log(`v13-base: ${baseRef} = ${site.base.version}`);
const server = await serve(site);
const browser = await chromium.launch({ headless: !args.flag('headed') });
try {
  const report: BenchReport = {
    schema: 1,
    createdAt: new Date().toISOString(),
    runner: runnerId(),
    ...commitInfo(),
    browser: `chromium ${browser.version()}`,
    options: {
      ...options,
      renderers,
      ...(renderers.includes('v13-base') && { base: baseRef }),
      fixtures: fixtures.length,
      sets,
      tiers,
      filter,
    },
    pipeline,
    unsupported,
    // R-ASCII-9: the chunks only a text render loads, from the production build's import graph.
    asciiSize: asciiSize(site.v13),
    asciiSizeByType: asciiSizeByType(site.v13),
    // R-PERF-8: core, the entry's static closure (D161).
    coreSize: closureSize(site.v13),
    renderers: await driveBrowser({ browser, server, site, renderers, fixtures, ...options, log }),
  };
  const outcome = gate(report, setting, reportOnly);
  publish(report, outcome, { updateBaseline: args.flag('update-baseline'), write: true });
  process.exitCode = outcome.exitCode;
} finally {
  await browser.close();
  await server.close();
}
