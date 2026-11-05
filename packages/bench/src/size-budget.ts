/**
 * The committed size budget (`packages/mermaid/size-budget.json`) and the static-closure
 * measurement it is checked against (R-PERF-1 / D160, R-PERF-8 / D161).
 *
 * Every size limit lives in the budget file; specs and gates read it from here, never a literal.
 * `measureStaticClosure` sizes any entry with the bench's production esbuild options, so later
 * entries (a CDN or ESM build) are measured the same way as core.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bundle } from './build.ts';
import { bundle, summarise } from './build.ts';
import type { SizeSummary } from './report.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The budget file `pnpm check` and the bench read. */
export const SIZE_BUDGET_FILE = new URL('../../mermaid/size-budget.json', import.meta.url);

export interface Budget {
  description: string;
  /** gzip-9 bytes. */
  gzipBytes: number;
}

export interface SizeBudget {
  /** R-PERF-8: the `entry`'s static import closure (repo-relative path). */
  core: Budget & { entry: string };
  /** R-PERF-1: core + flowchart as loaded for one flowchart render. */
  loaded: Budget;
}

function budgetAt(raw: unknown, key: string): Budget {
  const b = (raw as Record<string, unknown> | null)?.[key] as Partial<Budget> | undefined;
  if (typeof b?.gzipBytes !== 'number' || !(b.gzipBytes > 0)) {
    throw new Error(`size budget: "${key}.gzipBytes" must be a positive number`);
  }
  return { description: String(b.description ?? ''), gzipBytes: b.gzipBytes };
}

export function readSizeBudget(file: URL | string = SIZE_BUDGET_FILE): SizeBudget {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>>;
  const entry = raw.core?.entry;
  if (typeof entry !== 'string') throw new Error('size budget: "core.entry" must be a path');
  return { core: { ...budgetAt(raw, 'core'), entry }, loaded: budgetAt(raw, 'loaded') };
}

/** Totals over the files reachable from `roots` through static imports (paths relative to the outdir). */
export function closureSize(b: Bundle, roots: string[] = [b.entryFile]): SizeSummary {
  const seen: string[] = [];
  const visit = (file: string) => {
    if (seen.includes(file)) return;
    seen.push(file);
    for (const imp of b.graph[file]?.imports ?? []) if (imp.kind === 'static') visit(imp.path);
  };
  for (const r of roots) visit(r);
  return summarise(
    seen.map((p) => b.files.find((f) => f.path === p)!),
    'static'
  );
}

/** Output file of the lazily imported chunk whose source module is `entryPoint` (repo-relative). */
export function chunkOf(b: Bundle, entryPoint: string): string | undefined {
  return Object.keys(b.graph).find((f) => b.graph[f]!.entryPoint === entryPoint);
}

/** Source module of the flowchart chunk, as the registry imports it. */
export const FLOWCHART_ENTRY = 'packages/diagram-flowchart/src/index.ts';

/**
 * The static stand-in for R-PERF-1's loaded size: the entry's static closure plus the flowchart
 * chunk's, the same set the runner fetches for one flowchart render.
 */
export function flowchartClosureSize(b: Bundle): SizeSummary {
  const chunk = chunkOf(b, FLOWCHART_ENTRY);
  if (chunk === undefined) throw new Error(`no lazily imported chunk for ${FLOWCHART_ENTRY}`);
  return closureSize(b, [b.entryFile, chunk]);
}

export interface ClosureSize {
  bundle: Bundle;
  /** The entry's static import closure, `source: 'static'`. */
  size: SizeSummary;
}

/**
 * Bundles `entry` (repo-relative or absolute) with the bench's production esbuild options and
 * sizes its static import closure. `outdir` defaults to a fresh temporary directory.
 */
export async function measureStaticClosure(
  entry: string,
  outdir: string = mkdtempSync(join(tmpdir(), 'mermaid-size-'))
): Promise<ClosureSize> {
  const b = await bundle({
    entry: isAbsolute(entry) ? entry : join(ROOT, entry),
    outdir,
    bench: false,
  });
  return { bundle: b, size: closureSize(b) };
}

export interface BudgetCheck {
  ok: boolean;
  actual: number;
  limit: number;
  detail: string;
}

const kb = (bytes: number) => `${Math.round((bytes / 1024) * 10) / 10} KB`;

export function checkBudget(size: SizeSummary, budget: Budget): BudgetCheck {
  const ok = size.gzip <= budget.gzipBytes;
  const files = `${size.files.length} file(s)`;
  return {
    ok,
    actual: size.gzip,
    limit: budget.gzipBytes,
    detail: ok
      ? `${kb(size.gzip)} gz in ${files}, within the ${kb(budget.gzipBytes)} budget`
      : `${kb(size.gzip)} gz in ${files}, ${size.gzip - budget.gzipBytes} B over the ${kb(budget.gzipBytes)} budget`,
  };
}
