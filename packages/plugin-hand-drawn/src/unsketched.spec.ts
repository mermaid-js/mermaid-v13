/**
 * The eight types v12 never sketched (D301, D305, and cynefin, #423), and packet (#421),
 * treemap (#514) and wardley (#497), which v12 never sketched either, draw as before with the
 * plugin registered and `handDrawn` on (H3, #343): over each one's whole e2e corpus, the SVG is
 * byte-identical to the render without the plugin, and no warning is added. A type without a v13
 * package yet is skipped and joins when it is ported.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMermaid, type Mermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const DIAGRAMS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));

/** v12 type (as `detectType` reports it) → its e2e fixture folder. */
const UNSKETCHED: Readonly<Record<string, string>> = {
  sequence: 'sequence',
  gantt: 'gantt',
  pie: 'pie',
  timeline: 'timeline',
  journey: 'journey',
  quadrantChart: 'quadrant-chart',
  gitGraph: 'git',
  packet: 'packet',
  cynefin: 'cynefin',
  treemap: 'treemap',
  wardley: 'wardley',
  xychart: 'xychart',
};

const HAND_DRAWN = /look["']?\s*:\s*["']?handDrawn/;

function mmd(dir: string): [string, string][] {
  return readdirSync(join(DIAGRAMS, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => [`${dir}/${f}`, readFileSync(join(DIAGRAMS, dir, f), 'utf8')]);
}

interface Outcome {
  readonly svg?: string;
  readonly codes: readonly string[];
  readonly error?: string;
}

async function outcome(m: Mermaid, text: string): Promise<Outcome> {
  try {
    const r = await m.render('u', text);
    return { svg: r.svg, codes: r.warnings.map((w) => w.code) };
  } catch (e) {
    return { codes: [], error: String((e as { code?: unknown }).code ?? e) };
  }
}

const plain = createMermaid();
plain.initialize({ deterministic: true });
const withPlugin = createMermaid();
await withPlugin.registerExternalDiagrams([handDrawn]);
withPlugin.initialize({ deterministic: true, handDrawn: true } as never);

describe('the unsketched types are unchanged with handDrawn on (D301, D305)', () => {
  it('include sequence, which v13 renders, while a flowchart is sketched', async () => {
    expect(plain.supportsFormat('sequence', 'svg')).toBe(true);
    const flow = 'flowchart LR\n  A --> B\n';
    expect((await withPlugin.render('u', flow)).svg).not.toBe((await plain.render('u', flow)).svg);
  });

  for (const [type, folder] of Object.entries(UNSKETCHED)) {
    it.skipIf(!plain.supportsFormat(type, 'svg'))(
      `${type}: every ${folder} fixture draws the same bytes, with no added warning`,
      async () => {
        const files = mmd(folder);
        expect(files.length).toBeGreaterThan(0);
        let drawn = 0;
        for (const [path, text] of files) {
          const before = await outcome(plain, text);
          const after = await outcome(withPlugin, text);
          expect(after.error, path).toBe(before.error);
          expect(after.svg, path).toBe(before.svg);
          // Without the plugin `look: handDrawn` warns LOOK_REMOVED; with it, it is the alias.
          // Other `look` values (`neo`) still warn.
          const removed = HAND_DRAWN.test(text) ? ['LOOK_REMOVED'] : [];
          expect(after.codes, path).toEqual(before.codes.filter((c) => !removed.includes(c)));
          if (after.svg !== undefined) drawn++;
        }
        expect(drawn).toBeGreaterThan(0);
      },
      120_000
    );
  }

  it('treemap.look: handDrawn warns without the plugin, and draws unsketched with it', async () => {
    const text = '---\nconfig:\n  treemap:\n    look: handDrawn\n---\ntreemap\n  "A"\n    "b": 1\n';
    const plainSvg = (await plain.render('u', 'treemap\n  "A"\n    "b": 1\n')).svg;
    const before = await outcome(plain, text);
    const after = await outcome(withPlugin, text);
    expect(before).toEqual({ svg: plainSvg, codes: ['LOOK_REMOVED'] });
    expect(after).toEqual({ svg: plainSvg, codes: [] });
  });
});
