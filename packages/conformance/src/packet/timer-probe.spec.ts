// TEMPORARY PROBE: measures the CPU clocks' step on the CI runner. Removed before merge.
import { writeSync } from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { packetTokens } from '@mermaid-js/diagram-packet/testing';

const thread = (): number => {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1000;
};
const proc = (): number => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

/** Spin for `ms` of wall time, reading `clock`; return the non-zero deltas between reads. */
const steps = (clock: () => number, ms: number): number[] => {
  const out: number[] = [];
  const end = performance.now() + ms;
  let last = clock();
  while (performance.now() < end) {
    const now = clock();
    if (now !== last) {
      out.push(now - last);
      last = now;
    }
  }
  return out;
};

const summary = (xs: number[]): string => {
  if (xs.length === 0) return 'no steps';
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!.toFixed(3);
  return `n=${s.length} min=${q(0)} p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} max=${q(1)}`;
};

const log = (msg: string) => writeSync(2, `[timer-probe] ${msg}\n`);

describe('timer probe', () => {
  it('logs the clock steps', () => {
    log(
      `node ${process.version} kernel ${os.release()} cpus ${os.cpus().length} ${os.cpus()[0]?.model}`
    );
    log(`threadCpuUsage steps: ${summary(steps(thread, 400))}`);
    log(`cpuUsage steps:       ${summary(steps(proc, 400))}`);

    const P = 'packet\n';
    const shapes: [string, string, string][] = [
      ['quotes, never closed', P + '"'.repeat(4000), P + '"'.repeat(32000)],
      ['a long zero run', P + '0'.repeat(4000), P + '0'.repeat(32000)],
    ];
    for (const [name, small, large] of shapes) {
      packetTokens(large);
      const wall: number[] = [];
      for (let k = 0; k < 20; k++) {
        const t0 = performance.now();
        packetTokens(small);
        wall.push(performance.now() - t0);
      }
      // The spec's calibration, 20 times: reps and what one sample of that many reads.
      const out: string[] = [];
      for (let k = 0; k < 20; k++) {
        let reps = 1;
        for (;;) {
          const t0 = thread();
          const w0 = performance.now();
          for (let r = 0; r < reps; r++) packetTokens(small);
          const dt = thread() - t0;
          const dw = performance.now() - w0;
          if (dt >= 8) {
            out.push(`${reps}:${dt.toFixed(1)}/${dw.toFixed(1)}`);
            break;
          }
          reps *= 2;
        }
      }
      log(`${name}: one small lex wall ${summary(wall)}`);
      log(`${name}: calibration reps:threadMs/wallMs ${out.join(' ')}`);
    }
    expect(true).toBe(true);
  }, 60_000);
});
