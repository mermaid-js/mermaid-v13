// TEMPORARY CI probe helper (removed before the PR is ready): one cold measurement per process,
// after the same nine cycles the real spec files run before their ratio test.
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { createLanguageService } from '@mermaid-js/language-service';
import { flowchartLanguage } from '@mermaid-js/diagram-flowchart/language';
import { sequenceLanguage } from '@mermaid-js/diagram-sequence/language';
import { cycle, LANGUAGE_FIXTURE, typing } from './language.ts';
import { SEQUENCE_FIXTURE, sequenceCycle } from './language-sequence.ts';

const procMs = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};
let gcFn: ((o?: object) => void) | undefined;
function minorGc() {
  if (!gcFn) {
    setFlagsFromString('--expose-gc');
    gcFn = runInNewContext('gc') as (o?: object) => void;
  }
  gcFn({ type: 'minor' });
}

const METHODS = {
  old: { rounds: 25, warmup: 0, gc: false },
  new: { rounds: 60, warmup: 10, gc: true },
};

export async function probeOne(
  which: 'flowchart' | 'sequence',
  method: keyof typeof METHODS,
  copy: number
): Promise<void> {
  const m = METHODS[method];
  const flow = which === 'flowchart';
  const service = createLanguageService();
  await service.preload({ types: [which] });
  const texts = typing(flow ? LANGUAGE_FIXTURE : SEQUENCE_FIXTURE);
  const parse = flow
    ? (i: number) => flowchartLanguage.parse(texts(i), { keepTokens: true })
    : (i: number) => sequenceLanguage.parse(texts(i), { keepTokens: true });
  const full = flow
    ? (i: number) => cycle(service, texts(i))
    : (i: number) => sequenceCycle(service, texts(i));
  for (let i = 0; i < 9; i++) full(i);
  const t0 = performance.now();
  for (let i = 0; i < m.warmup; i++) {
    parse(i);
    full(i);
  }
  const p: number[] = [];
  const c: number[] = [];
  for (let i = 0; i < m.rounds; i++) {
    for (const [fn, out] of [
      [parse, p],
      [full, c],
    ] as const) {
      if (m.gc) minorGc();
      const t = procMs();
      fn(m.warmup + i);
      out.push(Math.round((procMs() - t) * 1000) / 1000);
    }
  }
  const ms = Math.round(performance.now() - t0);
  console.log(
    `R-LANG-4-RAW ${JSON.stringify({ mode: 'cold', rep: copy, which, method, k: 1, ms, p, c })}`
  );
}
