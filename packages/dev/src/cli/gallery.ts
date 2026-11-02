/**
 * `pnpm --filter @mermaid-js/dev gallery [outDir]`: writes the theme gallery (R-TEST-6) to
 * `outDir/index.html` (default `packages/dev/dist/gallery`). Fails when a fixture does not
 * render, so a broken gallery is never published.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { baselineFixtures, REPO_ROOT } from '../fixtures.ts';
import { buildGallery } from '../gallery.ts';

const outDir = resolve(process.argv[2] ?? join(import.meta.dirname, '..', '..', 'dist', 'gallery'));
const { version } = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages', 'mermaid', 'package.json'), 'utf8')
) as { version: string };

const gallery = await buildGallery(baselineFixtures(), { version });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), gallery.html);
process.stdout.write(`Gallery: ${gallery.count} diagrams -> ${join(outDir, 'index.html')}\n`);
if (gallery.failures.length > 0) {
  process.stderr.write(`Fixtures that failed to render:\n  ${gallery.failures.join('\n  ')}\n`);
  process.exit(1);
}
