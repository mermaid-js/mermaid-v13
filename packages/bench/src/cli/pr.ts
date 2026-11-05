/*
 * The PR check (`pr-check.ts`): sizes, one Node render of the corpus, instruction counts of v13
 * against its base and Pele, and a small browser run of v13 and mermaid@12. Writes
 * dist/reports/pr.{json,md} and comment.md (the PR comment), and applies the gates.
 *
 *   pnpm --filter @mermaid-js/bench pr [--base <ref>] [--mode auto|report|enforce]
 *     [--report-only speed,...] [--headed]
 *
 * `--base` defaults to BENCH_BASE_REF, else origin/mermaid-v13 (CI passes HEAD^1). Instruction
 * counts need Linux `perf` (BENCH_PERF names the binary); without it they are skipped.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { asciiSize, asciiSizeByType } from '../ascii-size.ts';
import { DEFAULT_BASE_REF } from '../base.ts';
import { runnerId } from '../baseline.ts';
import type { Bundle } from '../build.ts';
import { buildSite, driveBrowser, nodeEntry, serve } from '../driver.ts';
import { loadFixtures } from '../fixtures.ts';
import { INSTRUCTION_DEFAULTS, countInstructions, findPerf } from '../instruction-counts.ts';
import { detectPipeline } from '../pipeline.ts';
import type { PrReport } from '../pr-check.ts';
import { PR_DIAGRAMS, corpusInNode } from '../pr-check.ts';
import { formatPrComment, formatPrReport } from '../pr-markdown.ts';
import type { BenchReport } from '../report.ts';
import { closureSize, measureCoreSize } from '../size-budget.ts';
import { classifyFixtures } from '../support.ts';
import { parseArgs } from './args.ts';
import {
  REPORTS_DIR,
  ciRunUrl,
  commitInfo,
  gate,
  modeSetting,
  printGates,
  reportOnlyGates,
} from './output.ts';

const args = parseArgs(process.argv.slice(2));
const log = (line: string) => process.stdout.write(line + '\n');
const baseRef = args.get('base') ?? process.env.BENCH_BASE_REF ?? DEFAULT_BASE_REF;
const setting = modeSetting(args.get('mode'));
const reportOnly = reportOnlyGates(args.get('report-only'));

const all = loadFixtures();
const diagrams = PR_DIAGRAMS.map((diagram) => {
  const fixture = all.find((f) => f.id === diagram.id);
  if (!fixture) throw new Error(`PR diagram "${diagram.id}" is not a fixture`);
  return { diagram, fixture };
});
const corpus = classifyFixtures(all.filter((f) => f.set === 'corpus')).supported;

const pipeline = await detectPipeline(await import('mermaid'));
log(`Pipeline ${pipeline.present ? 'present' : 'missing'}: ${pipeline.reason}`);
const site = await buildSite({ baseRef });
if (site.base) log(`v13-base: ${baseRef} = ${site.base.version}`);
else log(`v13-base not built: ${site.baseError}`);
const staticGzip = (b: Bundle) => closureSize(b).gzip;

// 1. R-PERF-4: every corpus diagram once, in Node, with the production bundle.
const corpusCheck = await corpusInNode(nodeEntry(site, 'v13')!, corpus);
log(`Corpus in Node: ${corpusCheck.ok}/${corpusCheck.total} rendered`);

// 2. Instruction counts of v13, v13-base and Pele (reported, never gating).
const perf = findPerf();
const instructions = perf
  ? countInstructions({
      perf,
      site,
      renderers: ['v13', 'v13-base', 'pele'],
      diagrams,
      ...INSTRUCTION_DEFAULTS,
      log,
    })
  : undefined;
if (!perf) log('Instruction counts skipped: no perf that can count instructions here');

// 3. A small browser run: v13 and mermaid@12 on the PR diagrams (size, Ready at, speed).
const server = await serve(site);
const browser = await chromium.launch({ headless: !args.flag('headed') });
let renderers: BenchReport['renderers'];
let browserName: string;
try {
  browserName = `chromium ${browser.version()}`;
  renderers = await driveBrowser({
    browser,
    server,
    site,
    renderers: ['v13', 'v12-frozen'],
    fixtures: diagrams.map((d) => d.fixture),
    reps: 10,
    budgetMs: 1000,
    timeoutMs: 30_000,
    liftLimits: true,
    strip: true,
    log,
  });
} finally {
  await browser.close();
  await server.close();
}

const report: PrReport = {
  schema: 1,
  createdAt: new Date().toISOString(),
  runner: runnerId(),
  ...commitInfo(),
  base: {
    ref: baseRef,
    ...(site.base ? { version: site.base.version } : { error: site.baseError ?? 'not built' }),
  },
  pipeline,
  browser: browserName,
  node: `node ${process.version}`,
  staticGzip: {
    v13: staticGzip(site.v13),
    ...(site.base && { base: staticGzip(site.base) }),
  },
  asciiSize: asciiSize(site.v13),
  asciiSizeByType: asciiSizeByType(site.v13),
  renderers,
  corpus: corpusCheck,
  ...(instructions
    ? { instructions }
    : { instructionsSkipped: 'this machine has no `perf` that can count instructions' }),
};

// The gates read a bench report; the corpus count comes from Node, and the gates that need the
// full bench are skipped.
const benchView: BenchReport = {
  schema: 1,
  createdAt: report.createdAt,
  runner: report.runner,
  options: { pr: true },
  pipeline,
  asciiSize: report.asciiSize,
  asciiSizeByType: report.asciiSizeByType,
  coreSize: await measureCoreSize(),
  renderers,
};
const outcome = gate(benchView, setting, reportOnly, {
  corpusOk: corpusCheck.ok,
  skip: {
    speed: 'measured over the corpus by the nightly and release bench',
    'stage-regression': 'measured by the nightly and release bench',
  },
});

mkdirSync(REPORTS_DIR, { recursive: true });
const comment = formatPrComment(report, outcome, {
  runUrl: ciRunUrl(),
  baseLabel: process.env.GITHUB_BASE_REF || undefined,
});
writeFileSync(
  join(REPORTS_DIR, 'pr.json'),
  JSON.stringify({ ...report, gates: outcome }, null, 2) + '\n'
);
const md = formatPrReport(report, outcome);
writeFileSync(join(REPORTS_DIR, 'pr.md'), md + '\n');
writeFileSync(join(REPORTS_DIR, 'comment.md'), comment + '\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
log(`Report: ${join(REPORTS_DIR, 'pr.md')}`);
printGates(outcome, pipeline);
process.exitCode = outcome.exitCode;
