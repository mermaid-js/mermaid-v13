/**
 * `@mermaid-js/language-service/testing`: the shared golden runner (D99 suite 1, R-LANG-3),
 * for diagram packages outside this repository. Lay fixtures out as
 * `goldens/<diagram>/<feature>/<case>.mmd` (format: `goldens.ts`) and run them with your own
 * test runner and service:
 *
 * ```ts
 * import { createLanguageService } from '@mermaid-js/language-service';
 * import { goldenCases, missingFeatures, readFixture, renderGolden } from '@mermaid-js/language-service/testing';
 *
 * const service = createLanguageService({ facets: [myRow] });
 * beforeAll(() => service.preload());
 * for (const c of goldenCases(ROOT))
 *   it(`${c.feature}: ${c.name}`, async () => {
 *     const fixture = readFixture(readFileSync(c.input, 'utf8'));
 *     const doc = service.update(`golden:///${c.name}.mmd`, fixture.text);
 *     await expect(renderGolden(c.feature, doc, fixture)).toMatchFileSnapshot(c.output);
 *   });
 * it('has every required feature', () => expect(missingFeatures(ROOT, 'mine')).toEqual([]));
 * ```
 *
 * Node only (it reads the fixture folders).
 */
export {
  FEATURES,
  goldenCases,
  missingFeatures,
  readFixture,
  renderGolden,
  REQUIRED_FEATURES,
} from './goldens.ts';
export type { Fixture, GoldenCase } from './goldens.ts';
