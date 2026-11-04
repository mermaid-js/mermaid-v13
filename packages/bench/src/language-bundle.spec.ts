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
const FLOW = 'packages/diagram-flowchart/src/';

/** The `./language` source entry, read from the installed package's export map. */
function languageEntry(): URL {
  // The workspace link's real path: esbuild reports inputs by it.
  const link = new URL('../node_modules/@mermaid-js/diagram-flowchart', import.meta.url);
  const pkg = new URL(`file://${realpathSync(link)}/`);
  const manifest = JSON.parse(readFileSync(new URL('package.json', pkg), 'utf8')) as {
    exports: Record<string, Record<string, string>>;
  };
  const source = manifest.exports['./language']?.['mermaid-source'];
  if (source === undefined) throw new Error('diagram-flowchart exports no ./language');
  return new URL(source, pkg);
}

let language: Bundle;
let prod: Bundle;
beforeAll(async () => {
  [language, prod] = await Promise.all([
    build(languageEntry()),
    build(new URL('../../mermaid/src/index.ts', import.meta.url)),
  ]);
}, 60_000);

// R-LANG-8, D89: the language service loads a diagram's parser and tables, never its renderer.
describe('the flowchart ./language bundle', () => {
  it('holds the parser and the category table', () => {
    const all = inputs(language);
    expect(all).toContain(`${FLOW}language.ts`);
    expect(all).toContain(`${FLOW}parser/parser.ts`);
    expect(all).toContain(`${FLOW}generated/categories.ts`);
  });

  it('contains no renderer, plugin or ASCII code', () => {
    const leaked = inputs(language).filter(
      (i) =>
        i.startsWith(`${FLOW}render/`) ||
        i.startsWith(`${FLOW}ascii`) ||
        i === `${FLOW}plugin.ts` ||
        i.includes('packages/core/src/svg/') ||
        i.includes('packages/core/src/layout/')
    );
    expect(leaked).toEqual([]);
  });

  it('stays out of the mermaid bundle', () => {
    const all = inputs(prod);
    expect(all).not.toContain(`${FLOW}language.ts`);
    expect(all).not.toContain(`${FLOW}generated/categories.ts`);
  });
});
