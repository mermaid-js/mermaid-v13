import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monarchFiles, OUT_DIR } from '../scripts/monarch.ts';

describe('src/generated (the Monarch files)', () => {
  it.each([...monarchFiles()])(
    '%s is copied from the current generated grammar (`pnpm --filter @mermaid-js/language-service-monaco gen`)',
    (name, text) => {
      expect(readFileSync(join(OUT_DIR, name), 'utf8')).toBe(text);
    }
  );
});
