/**
 * Per-feature golden specs (D99 suite 1): every `goldens/<diagram>/<feature>/<case>.mmd`
 * through the service, compared with `<case>.out`. Format: src/testing/goldens.ts.
 * Update outputs with `vitest run packages/language-service -u`, then review the diff.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLanguageService } from './index.ts';
import { FEATURES, readFixture, renderGolden } from './testing/goldens.ts';

const ROOT = join(import.meta.dirname, '..', 'goldens');
const dirs = (path: string) =>
  readdirSync(path, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

const service = createLanguageService();
beforeAll(() => service.preload());

for (const diagram of dirs(ROOT)) {
  describe(diagram, () => {
    for (const feature of dirs(join(ROOT, diagram))) {
      const dir = join(ROOT, diagram, feature);
      const cases = readdirSync(dir)
        .filter((f) => f.endsWith('.mmd'))
        .sort();
      it.each(cases)(`${feature}: %s`, async (file) => {
        expect(Object.keys(FEATURES)).toContain(feature);
        const fixture = readFixture(readFileSync(join(dir, file), 'utf8'));
        const doc = service.update(`golden:///${diagram}/${feature}/${file}`, fixture.text);
        await expect(renderGolden(feature, doc, fixture)).toMatchFileSnapshot(
          join(dir, file.replace(/\.mmd$/, '.out'))
        );
      });
    }
  });
}
