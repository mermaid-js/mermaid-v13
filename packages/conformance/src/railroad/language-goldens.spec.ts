/**
 * The railroad facet's goldens per notation (R-LANG-3, #616): one facet serves four notations
 * (D511), so the language service's own check (`missingFeatures`, one golden per feature per
 * diagram) would pass with IR cases alone. Every notation needs a case for each of
 * `REQUIRED_FEATURES`: a case's name starts with its notation (`ir-`, `ebnf-`, `abnf-`, `peg-`).
 * The goldens live in `packages/language-service/goldens/railroad/` and run with the service's
 * golden suite (#615).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { firstPartyFacets } from '@mermaid-js/language-service';
import { REQUIRED_FEATURES } from '@mermaid-js/language-service/testing';

const ROOT = fileURLToPath(new URL('../../../language-service/goldens/railroad', import.meta.url));
const NOTATIONS = ['ir', 'ebnf', 'abnf', 'peg'];

describe('railroad goldens per notation', () => {
  it('load the facet from the generated rows, for all four types', () => {
    const rows = firstPartyFacets.filter((e) => e.type.startsWith('railroad'));
    expect(rows.map((e) => e.type)).toEqual([
      'railroad',
      'railroadEbnf',
      'railroadAbnf',
      'railroadPeg',
    ]);
    for (const row of rows) expect(row.load, row.type).toBeDefined();
  });

  it.each(NOTATIONS)('has %s cases for every required feature', (notation) => {
    const missing = REQUIRED_FEATURES.filter(
      (f) =>
        !readdirSync(join(ROOT, f)).some((n) => n.startsWith(`${notation}-`) && n.endsWith('.mmd'))
    );
    expect(missing).toEqual([]);
  });
});
