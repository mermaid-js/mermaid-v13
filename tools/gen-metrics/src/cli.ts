// Writes packages/core/src/text/metrics.ts from Trebuchet MS, Verdana, Arial and Courier New
// font files.
// Usage: pnpm --filter @mermaid-js/gen-metrics generate [fontDir]
// fontDir defaults to the macOS supplemental font folder.
// The fonts are read, never shipped: only their advance widths and vertical metrics are kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateMetrics } from './generate.ts';
import { FONT_FILES, METRICS_PATH, SYSTEM_FONT_DIR } from './sources.ts';

const dir = process.argv[2] ?? SYSTEM_FONT_DIR;
const source = generateMetrics(
  FONT_FILES.map(({ family, regular, bold }) => ({
    family,
    regular: readFileSync(join(dir, regular)),
    bold: readFileSync(join(dir, bold)),
  }))
);
writeFileSync(METRICS_PATH, source);
process.stdout.write(`Wrote ${METRICS_PATH}\n`);
