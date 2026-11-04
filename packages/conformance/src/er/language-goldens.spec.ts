/**
 * The shared language-service golden suite (D99 suite 1, R-LANG-3) for ER, run here until ER
 * has a manifest (T5, #134): `firstPartyFacets` gives a type a `load` only from its manifest's
 * `language` entry, so `packages/language-service/src/goldens.spec.ts` cannot load ER yet.
 * This spec gives the service the facet as an eager row (as a host bundling it would) and runs
 * the same runner over `packages/conformance/language-goldens/er/`.
 *
 * When the manifest lands, the last test fails: move the folder to
 * `packages/language-service/goldens/er/` (`git mv`, outputs unchanged) and delete this spec.
 * Update outputs with `vitest run packages/conformance/src/er/language-goldens.spec.ts -u`,
 * then review the diff.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { erLanguage } from '@mermaid-js/diagram-er/language';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import {
  goldenCases,
  missingFeatures,
  readFixture,
  renderGolden,
} from '@mermaid-js/language-service/testing';

const ROOT = join(import.meta.dirname, '..', '..', 'language-goldens');
const service = createLanguageService({
  facets: [{ type: 'er', id: 'er', detector: (t) => /^\s*erDiagram/.test(t), facet: erLanguage }],
});
beforeAll(() => service.preload());

describe('er language goldens', () => {
  it.each(goldenCases(ROOT).filter((c) => c.diagram === 'er'))('$feature: $name', async (c) => {
    const fixture = readFixture(readFileSync(c.input, 'utf8'));
    const doc = service.update(`golden:///er/${c.feature}/${c.name}.mmd`, fixture.text);
    await expect(renderGolden(c.feature, doc, fixture)).toMatchFileSnapshot(c.output);
  });

  it('has goldens for every required feature (the port checklist)', () => {
    expect(missingFeatures(ROOT, 'er')).toEqual([]);
  });

  it('runs here only while ER has no manifest `language` entry', () => {
    const row = firstPartyFacets.find((e) => e.type === 'er');
    expect(row?.load, 'move language-goldens/er to language-service/goldens/er').toBeUndefined();
  });
});
