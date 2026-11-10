// The swimlane engine's DDLT fixtures (D538) are what flowchart hands the engine today: a fresh
// capture matches the JSON in `packages/core/src/layout/swimlane/__tests__/ddlt/` byte for byte.
// On a difference, run `pnpm --filter @mermaid-js/conformance capture:swimlane` and review it.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUT_DIR, captureSwimlaneFixtures, serialiseFixture } from './swimlane/capture.ts';

describe('swimlane DDLT fixtures', () => {
  it('are in sync with flowchart and the measurer', { timeout: 60_000 }, async () => {
    const fixtures = await captureSwimlaneFixtures();
    const stored = (await readdir(OUT_DIR, { recursive: true }))
      .filter((f) => f.endsWith('.json'))
      .map((f) =>
        f
          .replace(/\.json$/, '')
          .split('\\')
          .join('/')
      )
      .sort();
    expect(stored).toEqual(fixtures.map((f) => f.id).sort());
    for (const f of fixtures) {
      const onDisk = await readFile(join(OUT_DIR, `${f.id}.json`), 'utf8');
      expect(onDisk, f.id).toBe(serialiseFixture(f));
    }
  });
});
