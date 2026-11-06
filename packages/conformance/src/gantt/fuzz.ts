/**
 * Generated gantt charts for the schedule parity (spec #293 T3): random date formats, excludes
 * and includes, weekends, inclusive ends, tags, sections, and starts and ends of every kind
 * (dates, durations, `after`/`until` with known, unknown and forward ids). Deterministic: a
 * linear congruential generator from a fixed seed.
 */
import type { CorpusItem } from '../types.ts';

const FORMATS = [
  'YYYY-MM-DD',
  'YYYY-MM-DD HH:mm',
  'DD/MM/YYYY',
  'x',
  'X',
  'D',
  '',
  'YYYYMMDD',
  'MMM D YYYY',
];
const EXCLUDES = [
  'weekends',
  'monday',
  'weekends, 2019-02-06',
  'friday,saturday',
  'sunday',
  '2020-03-08 2020-11-01',
];
const TAGS = ['', 'done, ', 'crit, active, ', 'milestone, ', 'vert, '];
const MONTHS = ['Jan', 'Feb', 'Mar'];

const pad = (v: number): string => String(v).padStart(2, '0');

export function scheduleFuzz(count: number, seed = 7): CorpusItem[] {
  let state = seed;
  const rnd = (n: number): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % n;
  };
  const pick = <T>(list: readonly T[]): T => list[rnd(list.length)]!;
  return Array.from({ length: count }, (_, k) => {
    const fmt = pick(FORMATS);
    const date = (): string => {
      const [y, m, d, h] = [2018 + rnd(4), 1 + rnd(12), 1 + rnd(28), rnd(24)];
      if (fmt === 'YYYY-MM-DD HH:mm') return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(rnd(60))}`;
      if (fmt === 'DD/MM/YYYY') return `${pad(d)}/${pad(m)}/${y}`;
      if (fmt === 'x') return String(new Date(y, m - 1, d).getTime());
      if (fmt === 'X') return String(Math.floor(new Date(y, m - 1, d).getTime() / 1000));
      if (fmt === 'D') return String(d);
      if (fmt === 'YYYYMMDD') return `${y}${pad(m)}${pad(d)}`;
      if (fmt === 'MMM D YYYY') return `${pick(MONTHS)} ${d} ${y}`;
      return rnd(3) ? `${y}-${pad(m)}-${pad(d)}` : `${y}-${m}-${d}`;
    };
    const lines = ['gantt'];
    if (fmt) lines.push('dateFormat ' + fmt);
    if (rnd(2)) lines.push('excludes ' + pick(EXCLUDES));
    if (rnd(4) === 0) lines.push('includes ' + pick(['2019-02-09', 'saturday']));
    if (rnd(4) === 0) lines.push('inclusiveEndDates');
    if (rnd(4) === 0) lines.push('weekend ' + pick(['friday', 'saturday']));
    const n = 1 + rnd(8);
    for (let i = 0; i < n; i++) {
      if (rnd(4) === 0) lines.push('section S' + rnd(3));
      const tags = pick(TAGS);
      const id = `t${rnd(n + 2)}`;
      const start = pick([date(), date(), `after t${rnd(n + 2)}`, `after t${rnd(n)} t${rnd(n)}`]);
      const end = pick([
        `${rnd(10)}d`,
        `${rnd(30)}h`,
        `${rnd(3)}w`,
        '0d',
        date(),
        `until t${rnd(n + 2)}`,
        '1.5d',
        'xx',
        `${1 + rnd(2)}M`,
      ]);
      const shape = rnd(4);
      let data = `${id}, ${start}, ${end}`;
      if (shape === 0) data = i === 0 ? `${date()}, ${end}` : end;
      else if (shape === 1) data = `${start}, ${end}`;
      lines.push(`  task ${i} :${tags}${data}`);
    }
    return { id: `schedule fuzz ${k}`, source: lines.join('\n') };
  });
}
