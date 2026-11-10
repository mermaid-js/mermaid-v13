import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRAMMARS_MODULE, grammarsModule, lezerFiles, OUT_DIR } from '../scripts/lezer.ts';

describe('src/generated (the Lezer parser)', () => {
  it.each([...lezerFiles()])(
    '%s is built from the current generated grammar (`pnpm --filter @mermaid-js/language-service-codemirror gen`)',
    (name, text) => {
      expect(readFileSync(join(OUT_DIR, name), 'utf8')).toBe(text);
    }
  );

  it('src/grammars.ts maps every highlighted type (`pnpm --filter @mermaid-js/language-service-codemirror gen`)', () => {
    const current = readFileSync(GRAMMARS_MODULE, 'utf8');
    expect(current).toBe(grammarsModule(current));
  });
});
