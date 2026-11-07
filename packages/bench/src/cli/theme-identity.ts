/**
 * The theme identity gate (D200, D339) for spec #414: every e2e `.mmd` fixture and every bench
 * fixture, rendered in Node through `createMermaid().render()` with `deterministic: true`, in
 * each of the eleven themes and `theme: 'auto'`, plain and under a few `themeVariables` and
 * `cssVariables` variants. Writes one digest per render, so a base checkout and the working
 * tree can be compared without a browser: the bench's own `--identity` mode covers only its
 * flowchart, sequence and class fixtures in the theme each one names.
 *
 *   pnpm --filter \@mermaid-js/bench theme-identity --out head.json
 *   pnpm --filter \@mermaid-js/bench theme-identity --out head.json --compare base.json
 *     [--filter text] [--allow id-substring,...]
 *
 * `--compare` prints every render whose SVG (or error text) differs and exits 1 when any does,
 * apart from the renders whose id contains one of `--allow`'s substrings (D333's listed
 * exceptions). Pass `--svg dir` to also write each differing pair's SVG for inspection.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { createMermaid } from 'mermaid';
import { loadFixtures } from '../fixtures.ts';
import { parseArgs } from './args.ts';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const args = parseArgs(process.argv.slice(2));

/** `themeVariables` and output variants, each rendered in every theme. */
const VARIANTS: Readonly<Record<string, Record<string, unknown>>> = {
  plain: {},
  darkMode: { themeVariables: { darkMode: true } },
  literal: { output: { cssVariables: false } },
  overrides: {
    themeVariables: {
      primaryColor: '#3366cc',
      secondaryColor: '#ffcc00',
      lineColor: '#aa3300',
      fontSize: '13px',
      cScale0: '#123456',
      borderColorArray: ['#ff0000', '#00ff00'],
    },
  },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.mmd')) out.push(p);
  }
  return out;
}

function sources(): [id: string, text: string][] {
  const e2e = walk(join(ROOT, 'e2e/diagrams')).map((p): [string, string] => [
    relative(ROOT, p),
    readFileSync(p, 'utf8'),
  ]);
  const bench = loadFixtures().map((f): [string, string] => [`bench/${f.id}`, f.source]);
  const filter = args.get('filter');
  const all = [...e2e, ...bench];
  return filter ? all.filter(([id]) => id.includes(filter)) : all;
}

/** A fixed instant, so gantt's `today` line and `today`-relative dates repeat (D270). */
const NOW = Date.UTC(2026, 0, 15, 12);

const digest = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);

async function run(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const items = sources();
  const variants = (args.get('variants') ?? Object.keys(VARIANTS).join(',')).split(',');
  const rendered = new Map<string, string>();
  for (const variant of variants) {
    for (const theme of [...THEME_NAMES, 'auto' as const]) {
      const m = createMermaid();
      m.initialize({ ...VARIANTS[variant], theme, deterministic: true });
      for (const [id, text] of items) {
        const key = `${id} ${theme} ${variant}`;
        try {
          await m.prepare(text, { id: 'mermaid-0', now: NOW });
          const { svg } = m.renderSync(text, { id: 'mermaid-0', now: NOW });
          out[key] = digest(svg);
          rendered.set(key, svg);
        } catch (e) {
          const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          out[key] = 'error ' + digest(msg);
          rendered.set(key, msg);
        }
      }
    }
  }
  const dir = args.get('svg');
  if (dir) {
    mkdirSync(dir, { recursive: true });
    const keep = new Set((args.get('keep') ?? '').split(',').filter(Boolean));
    for (const [key, svg] of rendered)
      if (keep.size === 0 || keep.has(key))
        writeFileSync(join(dir, key.replaceAll(/[/ ]/g, '__') + '.svg'), svg);
  }
  return out;
}

const result = await run();
const outFile = args.get('out');
if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 0));
const base = args.get('compare');
const log = (line: string) => process.stdout.write(line + '\n');
log(`theme identity: ${Object.keys(result).length} renders`);
if (base) {
  const before = JSON.parse(readFileSync(base, 'utf8')) as Record<string, string>;
  const allow = (args.get('allow') ?? '').split(',').filter(Boolean);
  const differing: string[] = [];
  const allowed: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(result)])) {
    if (before[key] === result[key]) continue;
    (allow.some((a) => key.includes(a)) ? allowed : differing).push(key);
  }
  for (const key of allowed) log(`  allowed: ${key}`);
  for (const key of differing) log(`  DIFFERS: ${key}`);
  log(`${differing.length} differing, ${allowed.length} allowed`);
  process.exitCode = differing.length ? 1 : 0;
}
