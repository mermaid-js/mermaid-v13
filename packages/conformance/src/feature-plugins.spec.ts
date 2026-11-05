/**
 * Both optional feature plugins at once (#215): `@mermaid-js/layout-elk` lays the graph out and
 * `@mermaid-js/plugin-math` draws the labels' TeX. The SVG passes the allow-list (R-SEC-2) and is
 * the same bytes from a fresh API object (R-ARCH-6).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import elkLayouts from '@mermaid-js/layout-elk';
import { math } from '@mermaid-js/plugin-math';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';

const DIAGRAMS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));
const fixture = (path: string): [string, string] => [
  path,
  readFileSync(join(DIAGRAMS, path), 'utf8'),
];

const CASES: readonly [string, string][] = [
  ...readdirSync(join(DIAGRAMS, 'katex/pr-check'))
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => fixture(`katex/pr-check/${f}`)),
  fixture('er-diagram/visual-check/a-not-so-simple-er-diagram-elk-layout.mmd'),
  fixture('er-diagram/visual-check/a-cyclical-er-diagram-elk-layout.mmd'),
  fixture('flowchart/nightly-check/elk-container-algorithms/elk-subgraph-with-box-algorithm.mmd'),
  // Math in every graph type, laid out by ELK.
  ['class + math', 'classDiagram\n  class A["$$a^2$$"]\n  A "$$n$$" --> B : $$\\frac{x}{y}$$\n'],
  ['state + math', 'stateDiagram-v2\n  s1 : $$\\sqrt{2}$$\n  s1 --> s2 : $$e^{i\\pi}$$\n'],
  [
    'er + math',
    'erDiagram\n  A["$$a_1$$"] {\n    string name "$$k_1$$"\n  }\n  A ||--o{ B : "$$\\beta$$"\n',
  ],
];

async function both() {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  m.registerLayoutLoaders(elkLayouts);
  await m.registerExternalDiagrams([math]);
  return m;
}

describe('ELK and math registered together', () => {
  it.each(CASES)('%s: inert and deterministic', async (_, source) => {
    const options = { config: { layout: 'elk' } };
    const first = await (await both()).render('d', source, options);
    const second = await (await both()).render('d', source, options);
    expect(second.svg).toBe(first.svg);
    assertInert(first.svg);
    const codes = first.warnings.map((w) => w.code);
    expect(codes).not.toContain('ELK_NOT_INSTALLED');
    expect(codes).not.toContain('MATH_NOT_RENDERED');
    expect(first.svg).not.toContain('$$');
  });
});
