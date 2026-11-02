/** Stored per-runner baselines (R-PERF-7, O-4) and the runner id they are keyed by. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Baseline } from './report.ts';

export const BASELINES_DIR = fileURLToPath(new URL('../baselines/', import.meta.url));

/** `BENCH_RUNNER` names the machine; unset, it is `local-<platform>-<arch>`. */
export function runnerId(env: Record<string, string | undefined> = process.env): string {
  const id = env.BENCH_RUNNER?.trim() || `local-${platform()}-${arch()}`;
  return id.replace(/[^\w.-]/g, '-');
}

export function baselinePath(runner: string): string {
  return `${BASELINES_DIR}${runner}.json`;
}

export function loadBaseline(runner: string): Baseline | undefined {
  const path = baselinePath(runner);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Baseline) : undefined;
}

export function saveBaseline(baseline: Baseline): string {
  mkdirSync(BASELINES_DIR, { recursive: true });
  const path = baselinePath(baseline.runner);
  writeFileSync(path, JSON.stringify(baseline, null, 2) + '\n');
  return path;
}
