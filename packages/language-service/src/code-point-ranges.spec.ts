/**
 * Diagnostic ranges cover whole code points (#173): an editor converts offsets to its own
 * positions, and a range that starts or ends between the two halves of a surrogate pair
 * splits the character (LSP clients render half an emoji, or reject the range).
 *
 * Property: over every `e2e/diagrams/**\/*.mmd`, plus inputs with astral characters in every
 * place a lexer can trip on them, no diagnostic range starts or ends inside a surrogate pair.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from './index.ts';
import { UNLISTED_FACETS } from './testing/unlisted-facets.ts';

const REPO = join(import.meta.dirname, '..', '..', '..');
const CORPUS = join(REPO, 'e2e', 'diagrams');

const corpus = (readdirSync(CORPUS, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((f) => join(CORPUS, f));

const service = createLanguageService({ facets: UNLISTED_FACETS });
beforeAll(() => service.preload());

/** Whether `at` falls between a high and a low surrogate of `text`. */
function splitsPair(text: string, at: number): boolean {
  if (at <= 0 || at >= text.length) return false;
  const hi = text.charCodeAt(at - 1);
  const lo = text.charCodeAt(at);
  return hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff;
}

/** Every diagnostic of `text` whose range splits a surrogate pair. */
function splits(name: string, text: string): string[] {
  const uri = `astral:///${name}`;
  const doc = service.update(uri, text);
  const bad = doc
    .diagnostics()
    .filter((d) => splitsPair(text, d.range.start) || splitsPair(text, d.range.end))
    .map((d) => `${name}: ${d.code} [${d.range.start},${d.range.end})`);
  service.close(uri);
  return bad;
}

const ASTRAL = ['😀', '𝒳', '🏳️‍🌈', '\u{20000}'];
const HEADERS = [
  'flowchart TD',
  'graph LR',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram-v2',
  'stateDiagram',
  'erDiagram',
];

/** Each header with an astral character where a node, an arrow, a label or a keyword goes. */
function astralInputs(): [string, string][] {
  const out: [string, string][] = [];
  for (const h of HEADERS) {
    for (const [i, c] of ASTRAL.entries()) {
      const bodies = [
        `${c} --> B`,
        `A --> ${c}`,
        `A ${c} B`,
        `A -${c}-> B`,
        `A[${c}] --> B`,
        `A["${c}"] --> B`,
        `${c}`,
        `${c}${c}`,
        `A ->> ${c}: hi`,
        `class ${c} {`,
        `[*] --> ${c}`,
        `A ||--o{ ${c} : has`,
        `A : ${c}`,
        `%% ${c}`,
        `classDef ${c} fill:red`,
        `participant ${c}`,
        `style A fill:${c}`,
        `A ~${c}~`,
        `${c} : x\n${c}`,
        `A --> B\n  ${c}`,
      ];
      for (const [j, b] of bodies.entries()) out.push([`${h} ${i}.${j}`, `${h}\n${b}\n`]);
      out.push([`${h} ${i} header`, `${h}${c}\nA --> B\n`]);
      out.push([`${h} ${i} eof`, `${h}\nA --> B ${c}`]);
    }
  }
  return out;
}

describe('diagnostic ranges cover whole code points', () => {
  it('on the reported case', () => {
    const text = 'flowchart TD\n😀 --> B';
    const doc = service.update('astral:///reported', text);
    const d = doc.diagnostics().find((x) => x.code === 'UNEXPECTED_CHARACTER');
    expect(d?.range).toEqual({ start: 13, end: 15 });
    expect(text.slice(d!.range.start, d!.range.end)).toBe('😀');
    expect(d?.message).toContain('`😀`');
  });

  it('over inputs with astral characters', () => {
    expect(astralInputs().flatMap(([name, text]) => splits(name, text))).toEqual([]);
  });

  it('over the corpus', () => {
    expect(corpus.length).toBeGreaterThan(2000);
    const bad = corpus.flatMap((f) => splits(relative(CORPUS, f), readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
