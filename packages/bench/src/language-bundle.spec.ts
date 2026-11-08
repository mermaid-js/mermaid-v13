import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { language as classFacet } from '@mermaid-js/diagram-class/language';
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
  {
    name: 'class',
    dir: 'diagram-class',
    renderer: ['render/', 'layout/', 'plugin.ts', 'index.ts'],
  },
  { name: 'quadrant', dir: 'diagram-quadrant', renderer: ['render/', 'layout/', 'index.ts'] },
  {
    name: 'journey',
    dir: 'diagram-journey',
    renderer: ['render/', 'layout/', 'plugin.ts', 'index.ts', 'labels.ts'],
  },
  {
    name: 'timeline',
    dir: 'diagram-timeline',
    renderer: ['render/', 'layout/', 'plugin.ts', 'index.ts', 'model.ts'],
  },
  {
    name: 'pie',
    dir: 'diagram-pie',
    renderer: ['render/', 'layout/', 'plugin.ts', 'index.ts'],
  },
  {
    name: 'mindmap',
    dir: 'diagram-mindmap',
    renderer: ['render/', 'layout/', 'plugin.ts', 'index.ts', 'icons.ts'],
  },
  {
    name: 'gitGraph',
    dir: 'diagram-gitgraph',
    renderer: ['render/', 'layout/', 'plugin.ts', 'index.ts', 'model.ts'],
  },
  {
    name: 'gantt',
    dir: 'diagram-gantt',
    renderer: ['schedule/', 'layout/', 'render/', 'dates/', 'plugin.ts', 'index.ts'],
  },
  {
    name: 'packet',
    dir: 'diagram-packet',
    renderer: ['render/', 'layout/', 'plugin.ts', 'index.ts', 'labels.ts'],
  },
  {
    name: 'cynefin',
    dir: 'diagram-cynefin',
    renderer: ['render/', 'layout/', 'theme/', 'plugin.ts', 'index.ts', 'testing.ts'],
  },
  {
    name: 'kanban',
    dir: 'diagram-kanban',
    renderer: ['render/', 'layout/', 'theme/', 'plugin.ts', 'index.ts', 'testing.ts'],
  },
  {
    name: 'info',
    dir: 'diagram-info',
    renderer: ['render.ts', 'layout.ts', 'ascii.ts', 'plugin.ts', 'index.ts'],
  },
  {
    name: 'radar',
    dir: 'diagram-radar',
    renderer: [
      'render/',
      'layout/',
      'theme/',
      'plugin.ts',
      'index.ts',
      'labels.ts',
      'config.ts',
      'testing.ts',
      'test-context.ts',
    ],
  },
  {
    name: 'wardley',
    dir: 'diagram-wardley',
    renderer: [
      'render/',
      'layout/',
      'theme/',
      'v12-specs/',
      'plugin.ts',
      'index.ts',
      'config.ts',
      'testing.ts',
    ],
  },
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

const ER = 'packages/diagram-er/src/';

const language = new Map<string, Bundle>();
let erLanguage: Bundle;
let prod: Bundle;
beforeAll(async () => {
  const built = await Promise.all([
    build(new URL('../../mermaid/src/index.ts', import.meta.url)),
    build(languageEntry('diagram-er')),
    ...PACKAGES.map((p) => build(languageEntry(p.dir))),
  ]);
  prod = built[0]!;
  erLanguage = built[1]!;
  PACKAGES.forEach((p, i) => language.set(p.name, built[i + 2]!));
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

it('the radar test context is in no shipped bundle (only `./testing` reaches it)', () => {
  const testContext = 'packages/diagram-radar/src/test-context.ts';
  expect(inputs(prod)).not.toContain(testContext);
  expect(inputs(language.get('radar')!)).not.toContain(testContext);
  // The bundle does reach radar's runtime code, so the check above is not vacuous.
  expect(inputs(prod)).toContain('packages/diagram-radar/src/plugin.ts');
});

it('the class ./language bundle is the entry of the class facet', () => {
  expect(classFacet.id).toBe('class');
});

describe('the er ./language bundle', () => {
  it('holds the parser and the category table', () => {
    const all = inputs(erLanguage);
    expect(all).toContain(`${ER}language.ts`);
    expect(all).toContain(`${ER}parser/parser.ts`);
    expect(all).toContain(`${ER}generated/categories.ts`);
  });

  it('contains no renderer, layout, plugin or ASCII code', () => {
    const leaked = inputs(erLanguage).filter(
      (i) =>
        (i.startsWith(ER) &&
          !/^packages\/diagram-er\/src\/(language|facet\/|parser\/|generated\/)/.test(i)) ||
        i.includes('packages/core/src/svg/') ||
        i.includes('packages/core/src/layout/')
    );
    expect(leaked).toEqual([]);
  });

  it('stays out of the mermaid bundle', () => {
    const all = inputs(prod);
    expect(all).not.toContain(`${ER}language.ts`);
    expect(all).not.toContain(`${ER}generated/categories.ts`);
  });
});
