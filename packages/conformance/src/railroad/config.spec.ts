/**
 * #615: how the `railroad` section's lengths and font size are read, against what 12.2.0 drew
 * (D151: v12 is the oracle). v12 read each through `sanitizeNumberValue` (`styles.ts`): a number
 * as it is, a string through `parseFloat` (`"12px"` is 12), kept when finite and 0 or more. Its
 * style sheet (`getStyles`, from the chunk the oracle's mermaid loads) shows the values it drew
 * with. v13 keeps that reading, and adds the cap every ported type has (D515, changeset
 * `config-lengths-checked`): 10000 or more is not drawn (v12 wrote `1e308` into the SVG and lost the drawing).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { railroadConfig, railroadConfigWarning } from '@mermaid-js/diagram-railroad';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: { reset(): void; initialize(config: object): void };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;
const chunks = join(
  dirname(createRequire(import.meta.url).resolve('mermaid-v12/package.json')),
  'dist/chunks/mermaid.core'
);
const { getStyles } = (await import(pathToFileURL(join(chunks, 'chunk-2E7WHVMD.mjs')).href)) as {
  getStyles: (options: object) => string;
};

/** v12's style sheet for a `railroad` section. */
function v12Styles(railroad: Record<string, unknown>): string {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme: 'default' });
  return getStyles({ railroad });
}

describe('railroad lengths and font size are read as 12.2.0 read them (#615)', () => {
  it.each([
    ['12px', 12],
    [' 3.5 ', 3.5],
    [7, 7],
    [0, 0],
  ])('takes %j as %d, as v12 drew it', (value, drawn) => {
    const css = v12Styles({ fontSize: value, strokeWidth: value });
    expect(css).toContain(`font-size: ${drawn}px;`);
    expect(css).toContain(`stroke-width: ${drawn}px;`);
    const config = railroadConfig({ fontSize: value, strokeWidth: value });
    expect(config.font.size).toBe(drawn);
    expect(config.lengths.strokeWidth).toBe(drawn);
    expect(railroadConfigWarning(config)).toBeUndefined();
  });

  it.each([['big'], [-1]])('drops %j to the default, as v12, now with a warning', (value) => {
    const css = v12Styles({ strokeWidth: value });
    expect(css).toContain('stroke-width: 2px;');
    const config = railroadConfig({ strokeWidth: value });
    expect(config.lengths.strokeWidth).toBe(2);
    expect(railroadConfigWarning(config)?.path).toBe('railroad.strokeWidth');
  });

  it('caps what v12 drew without a bound: 1e308 is not drawn (D515)', () => {
    expect(v12Styles({ strokeWidth: 1e308 })).toContain('stroke-width: 1e+308px;');
    const config = railroadConfig({ strokeWidth: 1e308, fontSize: 1e4, padding: 9999 });
    expect(config.lengths.strokeWidth).toBe(2);
    expect(config.font.size).toBeUndefined();
    expect(config.lengths.padding).toBe(9999);
    expect(config.dropped.map((d) => d.split(' ')[0])).toEqual([
      'railroad.strokeWidth',
      'railroad.fontSize',
    ]);
  });
});
