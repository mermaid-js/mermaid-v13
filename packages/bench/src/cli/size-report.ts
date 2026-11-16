/*
 * The size report on its own (#814, spec #813), without the browser bench: lines by package and
 * category, gzip bytes per diagram chunk of v13's production build, and Pele's published build.
 * Writes dist/reports/size-report.{json,md} and prints the markdown. The full bench report
 * carries the same section.
 *
 *   pnpm --filter @mermaid-js/bench size-report [--root <checkout>]
 *
 * `--root` counts the lines of another checkout (a `git worktree` or `git archive` of an older
 * commit) and skips the bytes, which need that checkout's dependencies.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { codeSizeLines } from '../code-size-markdown.ts';
import type { CodeSizeReport } from '../code-size.ts';
import { REPO_ROOT, measureCodeSize, measureLines } from '../code-size.ts';
import { measureStaticClosure, readSizeBudget } from '../size-budget.ts';
import { parseArgs } from './args.ts';
import { REPORTS_DIR, commitInfo } from './output.ts';

const args = parseArgs(process.argv.slice(2));
const root = args.get('root');

const report: CodeSizeReport & { root: string; commit?: string } = root
  ? { root: resolve(root), lines: measureLines(resolve(root)) }
  : {
      root: REPO_ROOT,
      ...commitInfo(),
      ...measureCodeSize(
        REPO_ROOT,
        (await measureStaticClosure(readSizeBudget().core.entry)).bundle
      ),
    };

const md = [
  `# Size report${report.commit ? ` at \`${report.commit}\`` : ''}`,
  '',
  `Root: \`${report.root}\``,
  '',
  ...codeSizeLines(report),
].join('\n');
mkdirSync(REPORTS_DIR, { recursive: true });
writeFileSync(join(REPORTS_DIR, 'size-report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(REPORTS_DIR, 'size-report.md'), md);
process.stdout.write(md + `\nReport: ${join(REPORTS_DIR, 'size-report.md')}\n`);
