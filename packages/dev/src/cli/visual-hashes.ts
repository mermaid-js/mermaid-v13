/**
 * `pnpm --filter @mermaid-js/dev visual:hashes <out.json> [root]`: renders every `.mmd` fixture
 * the snapshot run would photograph (every tier) to SVG in Node, as the e2e page does, and
 * writes `{ "<fixture path>": "<sha256 of the SVG>" }`. CI runs it on a PR and on its base and
 * photographs only the fixtures whose hash differs (D631, `visual-scope.ts`).
 *
 * `root` is the checkout to read (default: the one this file is in). The file imports only
 * modules the base of a PR has too, plus `fixed-clocks.ts`, because CI copies those two files
 * into the base checkout and runs them there: both sides are then hashed by the same code.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { supportsFormat } from 'mermaid';
import { renderDiagram } from '../adapter.ts';
import { fixedClockFor } from '../fixed-clocks.ts';
import { DIAGRAMS_DIR, discoverMmdFixtures, supportedTypesOf } from '../fixture-discovery.ts';
import { asHostText } from '../host-text.ts';

/**
 * The time a fixture with no entry in `fixed-clocks.ts` is rendered at. A gantt's today marker
 * follows the clock; the hashes of a PR and of its base must not differ because one was taken
 * a moment later.
 */
const DEFAULT_NOW = Date.UTC(2024, 0, 10, 12);
let now = DEFAULT_NOW;

const out = process.argv[2];
if (!out) {
  process.stderr.write('usage: visual-hashes <out.json> [root]\n');
  process.exit(2);
}
const root = resolve(process.argv[3] ?? join(import.meta.dirname, '..', '..', '..', '..'));
const diagramsDir = join(root, DIAGRAMS_DIR);

const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(now);
    else super(...(args as [number]));
  }
  static override now(): number {
    return now;
  }
}
globalThis.Date = FixedDate as DateConstructor;

const supportedTypes = supportedTypesOf((type) => supportsFormat(type, 'svg'));
const fixtures = await discoverMmdFixtures({ diagramsDir, supportedTypes });

const hashes: Record<string, string> = {};
let failed = 0;
for (const fixture of fixtures) {
  const source = readFileSync(join(diagramsDir, fixture), 'utf8');
  const clock = fixedClockFor(fixture);
  now = clock === undefined ? DEFAULT_NOW : RealDate.parse(clock);
  let rendered: string;
  try {
    rendered = (await renderDiagram(asHostText(source))).svg;
  } catch (error) {
    // A fixture that throws is still compared: the same failure on both sides is no change.
    failed += 1;
    rendered = `error: ${error instanceof Error ? error.message : String(error)}`;
  }
  hashes[fixture] = createHash('sha256').update(rendered).digest('hex');
}

writeFileSync(out, `${JSON.stringify(hashes, null, 1)}\n`);
process.stdout.write(`visual-hashes: ${fixtures.length} fixtures (${failed} threw) -> ${out}\n`);
