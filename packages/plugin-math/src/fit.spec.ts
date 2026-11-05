// The engine as a core inline-box provider (#237), through render(): the fit M2 builds on.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInert } from '@mermaid-js/core/svg';
import type { InlineProvider } from '@mermaid-js/core/text';
import { createMermaid, type ExtensionPlugin } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { MathError, typeset } from './engine.ts';

const KATEX_DIR = fileURLToPath(new URL('../../../e2e/diagrams/katex/pr-check/', import.meta.url));
const fixtures = readdirSync(KATEX_DIR)
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((f) => [f, readFileSync(join(KATEX_DIR, f), 'utf8')] as const);

const provider: InlineProvider = {
  open: '$$',
  close: '$$',
  box(tex, request) {
    try {
      return typeset(tex, { ex: request.ex, em: request.font.size });
    } catch (error) {
      if (error instanceof MathError) return undefined;
      throw error;
    }
  },
};
const math: ExtensionPlugin = { id: 'math', inline: [provider] };

async function api() {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([math]);
  return m;
}

describe('typeset as an inline provider', () => {
  it.each(fixtures)('%s renders its math as paths, inert and deterministic', async (_, source) => {
    const first = await (await api()).render('m', source);
    const second = await (await api()).render('m', source);
    expect(second.svg).toBe(first.svg);
    assertInert(first.svg);
    expect(first.warnings.map((w) => w.code)).not.toContain('MATH_NOT_RENDERED');
    expect(first.svg).not.toContain('$$');
  });

  it('shows the TeX as written where it does not parse', async () => {
    const r = await (await api()).render('m', 'flowchart LR\n  A["$$\\frac{a}$$"]');
    expect(r.svg).toContain('$$\\frac{a}$$');
  });
});
