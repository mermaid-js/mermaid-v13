/**
 * Headless benchmark: builds the runner site, renders the fixtures through every selected
 * renderer in each environment, writes dist/reports/<stamp>.{json,md} and applies the gates.
 *
 *   pnpm --filter @mermaid-js/bench bench
 *     [--env browser,node]
 *     [--renderers v13,v13-stages,v13-base,v12-frozen,v12-current,pele] [--base <ref>]
 *     [--set corpus,pele] [--filter text] [--tiers tiny,regular,large,huge] [--reps 10]
 *     [--budget 1000] [--timeout 30] [--headed] [--lift-limits false] [--strip false]
 *     [--mode auto|report|enforce] [--report-only speed,...] [--update-baseline]
 *
 * Environments (`--env`, default both): `browser` renders in Chromium through Playwright, to an
 * SVG in the document with layout forced; every gate reads it. `node` renders in a Node child
 * process per renderer, to the SVG string; it is reported only, and Mermaid 12 (which needs a
 * DOM) is not run there.
 *
 * `v13-base` is v13 built from `--base` (else BENCH_BASE_REF, else origin/mermaid-v13): the
 * branch a PR merges into. CI passes the PR merge commit's first parent.
 *
 * BENCH_RUNNER names the machine for baselines (O-4); BENCH_GATES sets the default mode;
 * BENCH_REPORT_ONLY lists gates that are reported but never fail the job.
 */
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { asciiSize } from '../ascii-size.ts';
import { DEFAULT_BASE_REF, resolveRef } from '../base.ts';
import { runnerId } from '../baseline.ts';
import { buildSite, drive, serve } from '../driver.ts';
import { loadFixtures } from '../fixtures.ts';
import { detectPipeline } from '../pipeline.ts';
import { driveNode } from '../node-driver.ts';
import type { BenchEnv, BenchReport, RendererId } from '../report.ts';
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
let commit: string | undefined;
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  commit = undefined;
}
const report: BenchReport = {
  schema: 1,
  createdAt: new Date().toISOString(),
  runner: runnerId(),
  ...(commit !== undefined && { commit }),
  options: {
    ...options,
    envs,
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
  renderers: [],
};

if (envs.includes('browser')) {
  const server = await serve(site);
  const browser = await chromium.launch({ headless: !args.flag('headed') });
  try {
    report.browser = `chromium ${browser.version()}`;
    for (const renderer of renderers) {
      log(`Running ${renderer} in the browser over ${fixtures.length} fixtures`);
      report.renderers.push(
        await drive({ browser, server, site, renderer, fixtures, ...options, log })
      );
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
  for (const renderer of inNode) {
    log(`Running ${renderer} in Node over ${fixtures.length} fixtures`);
    report.node.renderers.push(await driveNode({ site, renderer, fixtures, ...options, log }));
  }
}

// Every gate reads the browser runs; without them they can only be reported.
if (!envs.includes('browser') && setting !== 'report')
  log('No browser run: the gates are reported, not enforced.');
const outcome = gate(report, envs.includes('browser') ? setting : 'report', reportOnly);
publish(report, outcome, { updateBaseline: args.flag('update-baseline'), write: true });
process.exitCode = outcome.exitCode;
