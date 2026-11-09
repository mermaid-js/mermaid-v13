/**
 * The shared golden suite (D99 suite 1, R-LANG-3) for the railroad facet (#616), run here until
 * T5 (#615): `goldens/railroad/<feature>/<case>.mmd` through the language service with the
 * railroad rows (`facets.ts`), compared with `<case>.out`, in the format and with the runner of
 * `@mermaid-js/language-service/testing` (as a diagram package outside the repository runs it).
 * Every notation has cases for each of `REQUIRED_FEATURES`: a case's name starts with its
 * notation (`ir-`, `ebnf-`, `abnf-`, `peg-`).
 *
 * T5 moves `goldens/railroad/` to `packages/language-service/goldens/railroad/` and drops this
 * spec. Update outputs with `vitest run packages/conformance/src/railroad/language-goldens -u`,
 * then review the diff.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService, firstPartyFacets } from '@mermaid-js/language-service';
import {
  goldenCases,
  missingFeatures,
  readFixture,
  REQUIRED_FEATURES,
  renderGolden,
} from '@mermaid-js/language-service/testing';
import { RAILROAD_FACETS } from './facets.ts';

const ROOT = join(import.meta.dirname, 'goldens');
const NOTATIONS = ['ir', 'ebnf', 'abnf', 'peg'];

const service = createLanguageService({ facets: RAILROAD_FACETS });
beforeAll(() => service.preload());

const cases = goldenCases(ROOT);

describe('railroad goldens', () => {
  it.each(cases)('$feature: $name', async (c) => {
    const fixture = readFixture(readFileSync(c.input, 'utf8'));
    const doc = service.update(`golden:///${c.diagram}/${c.feature}/${c.name}.mmd`, fixture.text);
    expect(doc.facet?.id).toBe('railroad');
    await expect(renderGolden(c.feature, doc, fixture)).toMatchFileSnapshot(c.output);
  });
});

describe('the port checklist (R-LANG-3)', () => {
  it.each(RAILROAD_FACETS.map((e) => e.type))(
    '%s is still unlisted (T5: move the goldens to the language service, drop facets.ts)',
    (type) => {
      expect(firstPartyFacets.find((e) => e.type === type)?.load).toBeUndefined();
    }
  );

  it('has goldens for every required feature', () => {
    expect(missingFeatures(ROOT, 'railroad')).toEqual([]);
  });

  it.each(NOTATIONS)('has %s cases for every required feature', (notation) => {
    const missing = REQUIRED_FEATURES.filter(
      (f) =>
        !readdirSync(join(ROOT, 'railroad', f)).some(
          (n) => n.startsWith(`${notation}-`) && n.endsWith('.mmd')
        )
    );
    expect(missing).toEqual([]);
  });
});
