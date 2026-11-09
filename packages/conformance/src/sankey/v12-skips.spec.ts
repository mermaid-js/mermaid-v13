import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../corpus.ts';
import { loadDivergences } from '../divergences.ts';
import { DIVERGENCES_DIR } from '../registry.ts';

/**
 * Each test skipped in `diagram-sankey/src/v12-specs/` names the parity divergence that is its
 * cause (`diagram-sankey/scripts/v12-skips.json`). That divergence must still be listed: the
 * parity suite fails when a listed divergence disappears, so once its cause is fixed the entry
 * goes, and this spec then fails until the skip goes too.
 */
describe('sankey v12-spec skips', () => {
  it('each name a listed divergence and appear in the ported spec', () => {
    const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');
    const skips = JSON.parse(read('packages/diagram-sankey/scripts/v12-skips.json')) as Record<
      string,
      Record<string, { divergence: string }>
    >;
    const listed = new Set(loadDivergences(fileURLToPath(DIVERGENCES_DIR)).map((d) => d.id));
    const entries = Object.entries(skips).flatMap(([file, tests]) =>
      Object.entries(tests).map(([title, { divergence }]) => ({ file, title, divergence }))
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const { file, title, divergence } of entries) {
      expect(listed.has(divergence), `${title}: ${divergence}`).toBe(true);
      const spec = read(`packages/diagram-sankey/src/v12-specs/${file}`);
      expect(spec, title).toContain(`it.skip('${title}'`);
    }
  });
});
