/**
 * The shared golden suite (D99 suite 1, R-LANG-3): every `goldens/<diagram>/<feature>/<case>.mmd`
 * through the service, compared with `<case>.out`. Format and discovery: src/testing/goldens.ts.
 * A new diagram or feature folder runs without a code change. Every first-party diagram with a
 * facet must have cases for each of `REQUIRED_FEATURES`.
 * Update outputs with `vitest run packages/language-service -u`, then review the diff.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService, firstPartyFacets } from './index.ts';
import { goldenCases, missingFeatures, readFixture, renderGolden } from './testing/goldens.ts';

const ROOT = join(import.meta.dirname, '..', 'goldens');
const service = createLanguageService();
beforeAll(() => service.preload());

const cases = goldenCases(ROOT);
for (const diagram of [...new Set(cases.map((c) => c.diagram))]) {
  describe(diagram, () => {
    it.each(cases.filter((c) => c.diagram === diagram))('$feature: $name', async (c) => {
      const fixture = readFixture(readFileSync(c.input, 'utf8'));
      const doc = service.update(`golden:///${diagram}/${c.feature}/${c.name}.mmd`, fixture.text);
      await expect(renderGolden(c.feature, doc, fixture)).toMatchFileSnapshot(c.output);
    });
  });
}

describe('the port checklist (R-LANG-3)', () => {
  const withFacet = [...new Set(firstPartyFacets.filter((e) => e.load).map((e) => e.id))];
  it.each(withFacet)('%s has goldens for every required feature', (id) => {
    expect(missingFeatures(ROOT, id)).toEqual([]);
  });
});
