/**
 * The shared golden suite (D99 suite 1, R-LANG-3) for C4, before its manifest (#543): c4 has no
 * `firstPartyFacets` row with a `load` until T5 (#542) gives the manifest its `language` entry,
 * so `packages/language-service/goldens.spec.ts` cannot run C4 yet. Its goldens live here,
 * `goldens/c4/<feature>/<case>.mmd`, in the shared format, and run through the shared runner
 * (`@mermaid-js/language-service/testing`) with the facet as an eager row, as a host bundling it
 * would. The completion items are held to the shared validity rule too (no error inside the
 * inserted text; `completion-validity.spec.ts`).
 *
 * T5 moves `goldens/c4` to `packages/language-service/goldens/c4` and deletes this spec.
 * Update outputs with `vitest run packages/conformance/src/c4/language-goldens.spec.ts -u`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { c4Language, detectC4 } from '@mermaid-js/diagram-c4/language';
import { createLanguageService } from '@mermaid-js/language-service';
import {
  goldenCases,
  missingFeatures,
  readFixture,
  renderGolden,
} from '@mermaid-js/language-service/testing';

const ROOT = join(import.meta.dirname, 'goldens');
const service = createLanguageService({
  facets: [{ type: 'c4', id: 'c4', detector: (t) => detectC4(t), facet: c4Language }],
});
beforeAll(() => service.preload());

const cases = goldenCases(ROOT);

describe('c4 goldens', () => {
  it.each(cases)('$feature: $name', async (c) => {
    const fixture = readFixture(readFileSync(c.input, 'utf8'));
    const doc = service.update(`golden:///c4/${c.feature}/${c.name}.mmd`, fixture.text);
    // A header being typed is not detected yet: the service asks every loaded facet.
    expect(doc.facet?.id).toBe(detectC4(fixture.text) ? 'c4' : undefined);
    await expect(renderGolden(c.feature, doc, fixture)).toMatchFileSnapshot(c.output);
  });

  it('has goldens for every required feature (the port checklist, R-LANG-3)', () => {
    expect(missingFeatures(ROOT, 'c4')).toEqual([]);
  });
});

describe('c4 completion items are valid where they are offered', () => {
  const completions = cases.filter((c) => c.feature === 'completions');

  it.each(completions.map((c) => [c.name, c.input]))('%s', (_, input) => {
    const fixture = readFixture(readFileSync(input, 'utf8'));
    const doc = service.update('file:///valid.mmd', fixture.text);
    const problems: string[] = [];
    let offered = 0;
    for (const at of fixture.markers) {
      for (const item of doc.completions(at)) {
        offered++;
        const { start, end } = item.range;
        const text = fixture.text.slice(0, start) + item.insertText + fixture.text.slice(end);
        const after = service.update('file:///valid-after.mmd', text);
        const stop = start + item.insertText.length;
        const bad = after
          .diagnostics()
          .filter(
            (d) =>
              d.severity === 'error' &&
              !d.code.startsWith('UNCLOSED_') &&
              d.range.start >= start &&
              d.range.start < stop
          );
        for (const d of bad) problems.push(`@${at} ${item.label}: ${d.code} ${d.message}`);
      }
    }
    expect(problems).toEqual([]);
    if (fixture.markers.length > 0 && !input.includes('not-code')) {
      expect(offered).toBeGreaterThan(0);
    }
  });
});
