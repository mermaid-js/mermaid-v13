/** Formatting helpers shared by the full report and the PR comment. */
import { round } from './stats.ts';

export const dash = '–';
export const ms = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? dash : `${round(v, digits)} ms`;
/** Two decimals for ms and up, three significant digits below (stage times are often µs). */
export const num = (v: number | null | undefined): string =>
  v === null || v === undefined
    ? dash
    : String(Math.abs(v) >= 1 ? round(v, 2) : Number(v.toPrecision(3)));
export const kb = (bytes: number | undefined): string =>
  bytes === undefined ? dash : `${round(bytes / 1024, 1)} KB`;
export const row = (cells: (string | number)[]): string => `| ${cells.join(' | ')} |`;
export const rule = (n: number): string => row(Array<string>(n).fill('---'));
