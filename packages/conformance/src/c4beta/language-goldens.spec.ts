/**
 * The c4-beta goldens per required feature (R-LANG-3, spec #730 T6): one facet serves legacy C4
 * and c4-beta (the plugin shape of #730), so the language service's own check
 * (`missingFeatures`, one golden per feature per diagram id) passes with legacy cases alone.
 * Every `REQUIRED_FEATURES` entry needs a c4-beta case too: a case's name starts with `beta-`.
 * The goldens live in `packages/language-service/goldens/c4/` and run with the service's
 * golden suite.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REQUIRED_FEATURES } from '@mermaid-js/language-service/testing';

const ROOT = fileURLToPath(new URL('../../../language-service/goldens/c4', import.meta.url));

describe('c4-beta goldens per required feature', () => {
  it.each(REQUIRED_FEATURES)('has a beta- case for %s', (feature) => {
    const cases = readdirSync(join(ROOT, feature)).filter(
      (n) => n.startsWith('beta-') && n.endsWith('.mmd')
    );
    expect(cases.length, `no beta- case in goldens/c4/${feature}`).toBeGreaterThan(0);
  });
});
