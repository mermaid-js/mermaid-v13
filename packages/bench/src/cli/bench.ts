/**
 * Headless benchmark: builds the runner site, renders the fixtures in Chromium through every
 * selected renderer, writes dist/reports/<stamp>.{json,md} and applies the gates.
 *
 *   pnpm --filter @mermaid-js/bench bench [--renderers v13,v13-stages,v12-frozen,v12-current]
 *     [--set corpus,pele] [--filter text] [--tiers tiny,regular,large,huge] [--reps 10]
 *     [--budget 1000] [--timeout 30] [--headed] [--lift-limits false] [--strip false]
 *     [--mode auto|report|enforce] [--update-baseline]
 *
 * BENCH_RUNNER names the machine for baselines (O-4); BENCH_GATES sets the default mode.
 */
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { runnerId } from '../baseline.ts';
import { buildSite, drive, serve } from '../driver.ts';
import { loadFixtures } from '../fixtures.ts';
import { detectPipeline } from '../pipeline.ts';
import type { BenchReport, RendererId } from '../report.ts';
import { classifyFixtures } from '../support.ts';
import { parseArgs } from './args.ts';
import { gate, modeSetting, publish } from './output.ts';

const ALL: RendererId[] = ['v13', 'v13-stages', 'v12-frozen', 'v12-current'];
const args = parseArgs(process.argv.slice(2));
const renderers = (args.list('renderers') ?? ALL) as RendererId[];
for (const r of renderers)
  if (!ALL.includes(r)) throw new Error(`Unknown renderer "${r}" (${ALL.join(', ')})`);
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
const log = (line: string) => process.stdout.write(line + '\n');

// "Render works" is decided in Node through the public API, independent of the browser run.
const pipeline = await detectPipeline(await import('mermaid'));
log(`Pipeline ${pipeline.present ? 'present' : 'missing'}: ${pipeline.reason}`);
if (unsupported.length > 0)
  log(`Not run, no v13 package: ${unsupported.map((u) => `${u.id} (${u.type})`).join(', ')}`);

const site = await buildSite();
const server = await serve(site);
const browser = await chromium.launch({ headless: !args.flag('headed') });
let commit: string | undefined;
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  commit = undefined;
}
try {
  const report: BenchReport = {
    schema: 1,
    createdAt: new Date().toISOString(),
    runner: runnerId(),
    ...(commit !== undefined && { commit }),
    browser: `chromium ${browser.version()}`,
    options: { ...options, renderers, fixtures: fixtures.length, sets, tiers, filter },
    pipeline,
    unsupported,
    renderers: [],
  };
  for (const renderer of renderers) {
    log(`Running ${renderer} over ${fixtures.length} fixtures`);
    report.renderers.push(
      await drive({ browser, server, site, renderer, fixtures, ...options, log })
    );
  }
  const outcome = gate(report, setting);
  publish(report, outcome, { updateBaseline: args.flag('update-baseline'), write: true });
  process.exitCode = outcome.exitCode;
} finally {
  await browser.close();
  await server.close();
}
