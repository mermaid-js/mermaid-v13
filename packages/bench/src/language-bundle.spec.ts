import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Bundle } from './build.ts';
import { bundle } from './build.ts';

const build = (entry: URL) =>
  bundle({
    entry: fileURLToPath(entry),
    outdir: mkdtempSync(join(tmpdir(), 'mermaid-language-')),
    bench: false,
  });

const inputs = (b: Bundle) => Object.values(b.graph).flatMap((f) => f.inputs);
/** The first-party packages with a `./language` facet, and the subpaths it must not reach. */
const PACKAGES = [
  { name: 'flowchart', dir: 'diagram-flowchart', renderer: ['render/', 'ascii', 'plugin.ts'] },
  { name: 'state', dir: 'diagram-state', renderer: ['render/', 'layout/', 'plugin.ts'] },
] as const;

/** The `./language` source entry, read from the installed package's export map. */
function languageEntry(dir: string): URL {
  // The workspace link's real path: esbuild reports inputs by it.
  const link = new URL(`../node_modules/@mermaid-js/${dir}`, import.meta.url);
  const pkg = new URL(`file://${realpathSync(link)}/`);
  const manifest = JSON.parse(readFileSync(new URL('package.json', pkg), 'utf8')) as {
    exports: Record<string, Record<string, string>>;
  };
  const source = manifest.exports['./language']?.['mermaid-source'];
  if (source === undefined) throw new Error(`${dir} exports no ./language`);
  return new URL(source, pkg);
}

const language = new Map<string, Bundle>();
let prod: Bundle;
beforeAll(async () => {
  const built = await Promise.all([
    build(new URL('../../mermaid/src/index.ts', import.meta.url)),
    ...PACKAGES.map((p) => build(languageEntry(p.dir))),
  ]);
  prod = built[0]!;
  PACKAGES.forEach((p, i) => language.set(p.name, built[i + 1]!));
}, 60_000);

// R-LANG-8, D89: the language service loads a diagram's parser and tables, never its renderer.
describe.each(PACKAGES)('the $name ./language bundle', ({ name, dir, renderer }) => {
  const src = `packages/${dir}/src/`;

  it('holds the parser and the category table', () => {
    const all = inputs(language.get(name)!);
    expect(all).toContain(`${src}language.ts`);
    expect(all).toContain(`${src}parser/parser.ts`);
    expect(all).toContain(`${src}generated/categories.ts`);
  });

  it('contains no renderer, layout, plugin or ASCII code', () => {
    const leaked = inputs(language.get(name)!).filter(
      (i) =>
        renderer.some((r) => i.startsWith(`${src}${r}`)) ||
        i.includes('packages/core/src/svg/') ||
        i.includes('packages/core/src/layout/')
    );
    expect(leaked).toEqual([]);
  });

  it('stays out of the mermaid bundle', () => {
    const all = inputs(prod);
    expect(all).not.toContain(`${src}language.ts`);
    expect(all).not.toContain(`${src}generated/categories.ts`);
  });
});
