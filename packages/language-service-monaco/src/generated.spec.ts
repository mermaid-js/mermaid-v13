import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRAMMARS_MODULE, grammarsModule, monarchFiles, OUT_DIR } from '../scripts/monarch.ts';

describe('src/generated (the Monarch files)', () => {
  it.each([...monarchFiles()])(
    '%s is copied from the current generated grammar (`pnpm --filter @mermaid-js/language-service-monaco gen`)',
    (name, text) => {
      expect(readFileSync(join(OUT_DIR, name), 'utf8')).toBe(text);
    }
  );

  it('src/grammars.ts maps every highlighted type (`pnpm --filter @mermaid-js/language-service-monaco gen`)', () => {
    const current = readFileSync(GRAMMARS_MODULE, 'utf8');
    expect(current).toBe(grammarsModule(current));
  });
});
