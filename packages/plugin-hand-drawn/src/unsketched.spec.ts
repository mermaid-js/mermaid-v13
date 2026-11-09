/**
 * The types v12 never sketched (D301, D305) draw as before with the plugin registered and
 * `handDrawn` on (H3, #343): over each one's whole e2e corpus, the SVG is byte-identical to the
 * render without the plugin, and no warning is added. They are the fixture folders whose
 * `hand-drawn.txt` says `unsketched` (a port adds that file, so this spec never names a type).
 * A folder whose types have no v13 package yet is skipped and joins when it is ported.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMermaid, type Mermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { handDrawn } from './index.ts';

const DIAGRAMS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));

/** The fixture folders v12 never sketched: their `hand-drawn.txt` says `unsketched`. */
const UNSKETCHED = readdirSync(DIAGRAMS)
  .filter((dir) => {
    const file = join(DIAGRAMS, dir, 'hand-drawn.txt');
    return existsSync(file) && readFileSync(file, 'utf8').split('\n')[0]!.trim() === 'unsketched';
  })
  .sort();

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

  it('include the types v12 never sketched, sequence among them', () => {
    expect(UNSKETCHED).toContain('sequence');
  });

  for (const folder of UNSKETCHED) {
    const files = mmd(folder);
    // The folder's types, as `detectType` reports them; it runs once each has a v13 package.
    const types = new Set(
      files.flatMap(([, text]) => {
        try {
          return [plain.detectType(text)];
        } catch {
          return [];
        }
      })
    );
    it.skipIf(types.size === 0 || ![...types].every((t) => plain.supportsFormat(t, 'svg')))(
      `${folder}: every fixture draws the same bytes, with no added warning`,
      async () => {
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
});
