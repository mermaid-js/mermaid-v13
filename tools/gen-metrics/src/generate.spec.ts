import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { generateMetrics } from './generate.ts';
import { FONT_FILES, METRICS_PATH, SYSTEM_FONT_DIR } from './sources.ts';

// The font files are not shipped. Where they are installed (macOS), the committed table must be
// exactly what the generator writes from them; elsewhere this check is skipped.
const fontsPresent = FONT_FILES.every(
  (f) => existsSync(join(SYSTEM_FONT_DIR, f.regular)) && existsSync(join(SYSTEM_FONT_DIR, f.bold))
);

describe('gen-metrics', () => {
  it.skipIf(!fontsPresent)('committed metrics.ts matches the installed font files', () => {
    const generated = generateMetrics(
      FONT_FILES.map(({ family, regular, bold }) => ({
        family,
        regular: readFileSync(join(SYSTEM_FONT_DIR, regular)),
        bold: readFileSync(join(SYSTEM_FONT_DIR, bold)),
      }))
    );
    expect(readFileSync(METRICS_PATH, 'utf8')).toBe(generated);
  });

  // DESIGN §14: label layout + measurer + tables share 6 KB gz. The tables get at most 1.5 KB,
  // leaving the rest for the measurer (about 1 KB minified) and label layout (#10).
  it('keeps the committed tables within 1.5 KB gzipped', () => {
    expect(gzipSync(readFileSync(METRICS_PATH), { level: 9 }).length).toBeLessThanOrEqual(1536);
  });
});
