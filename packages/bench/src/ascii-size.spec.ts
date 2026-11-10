import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  asciiPaths,
  asciiSize,
  asciiSizeByType,
  isAsciiModule,
  splitByFormat,
} from './ascii-size.ts';
import type { Bundle } from './build.ts';
import { bundle } from './build.ts';
import { chunkOf, closureSize } from './size-budget.ts';

const entry = fileURLToPath(new URL('../../mermaid/src/index.ts', import.meta.url));
const packages = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The diagram types with a text entry, from their manifests (the `mermaid.ascii` key), sorted:
 * a port that adds one is found here, so no list in this file names it.
 */
function asciiTypes(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(packages).sort()) {
    const manifest = join(packages, dir, 'package.json');
    if (!dir.startsWith('diagram-') || !existsSync(manifest)) continue;
    const { mermaid } = JSON.parse(readFileSync(manifest, 'utf8')) as {
      mermaid?: { plugin?: string; ascii?: string };
    };
    if (mermaid?.plugin === 'diagram' && mermaid.ascii !== undefined)
      out.push(dir.slice('diagram-'.length));
  }
  return out;
}

/** The production bundle the bench serves as `v13` (R-PERF-1), built once for the file. */
let prod: Bundle;
beforeAll(async () => {
  prod = await bundle({
    entry,
    outdir: mkdtempSync(join(tmpdir(), 'mermaid-ascii-')),
    bench: false,
  });
}, 60_000);

describe('ascii chunks in the production bundle (R-ASCII-9, D76, D87)', () => {
  it('takes the entry output for the entry, not the first lazily imported chunk', () => {
    expect(prod.entryFile).toBe('index.js');
    expect(prod.staticClosure[0]).toBe('index.js');
  });

  it('an SVG flowchart render loads no ascii module', () => {
    const { svg } = splitByFormat(prod);
    expect(svg).toContain(prod.entryFile);
    const leaked = svg.flatMap((f) => prod.graph[f]!.inputs.filter(isAsciiModule));
    expect(leaked).toEqual([]);
  });

  // #464: packet's text entry is its own lazily imported chunk, apart from its plugin; nor does
  // the plugin carry what only `./testing` exports (v12's token names, the layout invariants).
  it('a packet SVG render loads the packet plugin, and no ascii or testing-only module', () => {
    const plugin = chunkOf(prod, 'packages/diagram-packet/src/index.ts');
    expect(plugin).toBeDefined();
    const { svg } = splitByFormat(prod);
    expect(svg).toContain(plugin);
    const loaded = closureSize(prod, [prod.entryFile, plugin!]).files.map((f) => f.path);
    const inputs = loaded.flatMap((f) => prod.graph[f]!.inputs);
    expect(inputs).toContain('packages/diagram-packet/src/plugin.ts');
    expect(inputs.filter(isAsciiModule)).toEqual([]);
    // The table's own strings, in case it moves back into a module the parser imports.
    const code = loaded.map((f) => readFileSync(join(prod.outdir, f), 'utf8')).join('\n');
    expect(code).not.toContain('SINGLE_LINE_COMMENT');
    const testingOnly = ['parser/langium-names.ts', 'layout/invariants.ts', 'layout/fixtures.ts'];
    expect(
      inputs.filter((i) => testingOnly.some((t) => i.endsWith(`diagram-packet/src/${t}`)))
    ).toEqual([]);
  });

  it('keeps the SVG flowchart path loading the flowchart plugin (the R-PERF-1 set)', () => {
    const { svg } = splitByFormat(prod);
    const inputs = svg.flatMap((f) => prod.graph[f]!.inputs);
    expect(inputs.some((i) => i.includes('diagram-flowchart/src/plugin.ts'))).toBe(true);
  });

  it('puts core/ascii and each diagram ascii entry only in chunks a text render loads', () => {
    const { ascii } = splitByFormat(prod);
    const inputs = ascii.flatMap((f) => prod.graph[f]!.inputs);
    expect(inputs.some((i) => i.includes('core/src/ascii/canvas.ts'))).toBe(true);
    const types = asciiTypes();
    // A fixed floor, so a broken discovery cannot pass on an empty list: 13.0's first six text
    // types. A port never adds itself here; its manifest's `ascii` entry puts it in `types`, and
    // the next spec holds every discovered type to its own text path.
    expect(types).toEqual(
      expect.arrayContaining(['flowchart', 'er', 'sequence', 'packet', 'info', 'kanban'])
    );
    for (const type of types)
      expect(inputs.some((i) => i.includes(`diagram-${type}/src/ascii.ts`))).toBe(true);
  });

  // A page draws one type as text: each type's path is core/ascii plus its own entry, and the
  // budget is the largest of them, not every type's drawing at once.
  it('measures one text path per diagram type, each holding core/ascii and only its own entry', () => {
    const paths = asciiPaths(prod);
    expect(paths.map((p) => p.diagram)).toEqual(asciiTypes());
    for (const { diagram, size } of paths) {
      const inputs = size.files.flatMap((f) => prod.graph[f.path]!.inputs);
      expect(inputs.some((i) => i.includes('core/src/ascii/canvas.ts'))).toBe(true);
      const own = inputs.filter((i) => /diagram-[^/]+\/src\/ascii\.ts$/.test(i));
      expect(own).toEqual([`packages/diagram-${diagram}/src/ascii.ts`]);
    }
    expect(asciiSize(prod).gzip).toBe(Math.max(...paths.map((p) => p.size.gzip)));
    expect(asciiSizeByType(prod)).toEqual(
      Object.fromEntries(paths.map((p) => [p.diagram, p.size.gzip]))
    );
  });

  // The bench CLI runs from packages/bench, the specs from the repo root: the split must not
  // depend on the working directory, or the gate measures nothing.
  it('finds the ascii chunks when built from the bench package directory', () => {
    const probe = [
      "import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';",
      "import { tmpdir } from 'node:os';",
      "import { join } from 'node:path';",
      "import { bundle } from './src/build.ts';",
      "import { asciiSize } from './src/ascii-size.ts';",
      "const b = await bundle({ entry: new URL('../mermaid/src/index.ts', 'file://' + process.cwd() + '/').pathname, outdir: mkdtempSync(join(tmpdir(), 'mermaid-ascii-cwd-')), bench: false });",
      'process.stdout.write(String(asciiSize(b).files.length));',
    ].join('\n');
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', probe],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
      }
    );
    expect(Number(out)).toBeGreaterThan(0);
  }, 60_000);

  // D87: the 15 KB budget is soft. The size is measured here and reported by the bench's
  // `ascii-size` gate (report-only); only the SVG path above is a hard check.
  it('measures the ascii chunks (the soft 15 KB budget is the bench gate’s)', () => {
    const size = asciiSize(prod);
    expect(size.source).toBe('static');
    expect(size.gzip).toBeGreaterThan(0);
    expect(size.files.length).toBeGreaterThan(0);
  });
});
