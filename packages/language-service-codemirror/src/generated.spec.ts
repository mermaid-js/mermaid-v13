import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lezerFiles, OUT_DIR } from '../scripts/lezer.ts';

describe('src/generated (the Lezer parser)', () => {
  it.each([...lezerFiles()])(
    '%s is built from the current flowchart grammar (`pnpm --filter @mermaid-js/language-service-codemirror gen`)',
    (name, text) => {
      expect(readFileSync(join(OUT_DIR, name), 'utf8')).toBe(text);
    }
  );
});
