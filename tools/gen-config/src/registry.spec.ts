import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  lazyEngines,
  DETECTORS_PATH,
  FACETS_PATH,
  generateDetectors,
  generateFacets,
  REGISTRY_PATH,
  generateRegistry,
  readManifests,
} from './registry.ts';
import { generateFormatMatrix } from './format-matrix.ts';

describe('first-party diagram registry (DESIGN §12.4)', () => {
  it('maps the manifest types onto the v12 detector table', () => {
    const out = generateRegistry([
      {
        name: '@x/diagram-gantt',
        manifest: {
          plugin: 'diagram',
          id: 'gantt',
          types: ['gantt'],
          formats: ['svg'],
          export: 'gantt',
        },
      },
    ]);
    expect(out).toContain("  { type: 'mindmap', pattern: /^\\s*mindmap/ },");
    expect(out).toContain("    load: () => import('@x/diagram-gantt').then((m) => m.gantt),");
    expect(out.indexOf("'flowchart-elk'")).toBeLessThan(out.indexOf("'gantt'"));
  });

  it('loads the ascii entry through its exports subpath, separately (D76)', () => {
    const out = generateRegistry([
      {
        name: '@x/diagram-flowchart',
        exports: { '.': { default: './dist/index.js' }, './ascii': { default: './dist/ascii.js' } },
        manifest: {
          plugin: 'diagram',
          id: 'flowchart',
          types: ['flowchart-v2'],
          formats: ['svg', 'ascii'],
          export: 'flowchart',
          ascii: './dist/ascii.js',
        },
      },
    ]);
    expect(out).toContain(
      "    loadAscii: () => import('@x/diagram-flowchart/ascii').then((m) => m.ascii),"
    );
  });

  it('rejects an ascii entry no exports subpath serves', () => {
    expect(() =>
      generateRegistry([
        {
          name: '@x/diagram-flowchart',
          exports: { '.': { default: './dist/index.js' } },
          manifest: {
            plugin: 'diagram',
            id: 'flowchart',
            types: ['flowchart-v2'],
            formats: ['svg', 'ascii'],
            export: 'flowchart',
            ascii: './dist/ascii.js',
          },
        },
      ])
    ).toThrow(/no exports subpath/);
  });

  it('rejects a manifest type v12 does not have', () => {
    expect(() =>
      generateRegistry([
        {
          name: '@x/diagram-y',
          manifest: { plugin: 'diagram', id: 'y', types: ['y'], formats: ['svg'], export: 'y' },
        },
      ])
    ).toThrow(/not a v12 diagram type/);
  });

  it('is up to date (run `pnpm gen:registry`)', () => {
    expect(readFileSync(REGISTRY_PATH, 'utf8')).toBe(generateRegistry(readManifests()));
  });

  it('writes the detector table without loaders, for mermaid/slim', () => {
    const out = generateDetectors([
      {
        name: '@x/diagram-gantt',
        manifest: {
          plugin: 'diagram',
          id: 'gantt',
          types: ['gantt'],
          formats: ['svg'],
          export: 'gantt',
        },
      },
    ]);
    expect(out).toContain(
      "  { type: 'gantt', pattern: /^\\s*gantt/, id: 'gantt', formats: ['svg'] },"
    );
    expect(out).not.toContain('import(');
    expect(out.indexOf("'flowchart-elk'")).toBeLessThan(out.indexOf("'gantt'"));
  });

  it('has an up-to-date detector table (run `pnpm gen:registry`)', () => {
    expect(readFileSync(DETECTORS_PATH, 'utf8')).toBe(generateDetectors(readManifests()));
  });
});

describe('first-party language facets (R-LANG-8, D89)', () => {
  const flowchart = {
    name: '@x/diagram-flowchart',
    exports: {
      '.': { default: './dist/index.js' },
      './language': { default: './dist/language.js' },
    },
    manifest: {
      plugin: 'diagram' as const,
      id: 'flowchart',
      types: ['flowchart-elk', 'flowchart-v2'],
      formats: ['svg'],
      export: 'flowchart',
      language: './dist/language.js',
    },
  };

  it('lists every v12 type in detector order, loading the facet through its subpath', () => {
    const out = generateFacets([flowchart]);
    expect(out).toContain(
      "    load: () => import('@x/diagram-flowchart/language').then((m) => m.language),"
    );
    expect(out).toContain(
      "  { type: 'mindmap', id: 'mindmap', pattern: /^\\s*mindmap/, detector: (text) => /^\\s*mindmap/.test(text) },"
    );
    expect(out).toContain('    pattern: /^\\s*(graph|flowchart)/,');
    expect(out).toContain('    detector: (text) => /^\\s*(graph|flowchart)/.test(text),');
    // The config section the renderer reads: the package id; a type with no package has none.
    expect(out).toContain("    section: 'flowchart',");
    expect(out).not.toContain('baseSection');
    expect(out).not.toMatch(/type: 'mindmap'.*section/);
    expect(out.indexOf("'flowchart-elk'")).toBeLessThan(out.indexOf("'mindmap'"));
    expect(out.indexOf("'sequence'")).toBeLessThan(out.indexOf("'flowchart-v2'"));
  });

  it("takes the manifest's section where it is not the id (wardley-beta, D421)", () => {
    const manifest = { ...flowchart.manifest, section: 'flowchart-beta' };
    const out = generateFacets([{ ...flowchart, manifest }]);
    expect(out).toContain("    section: 'flowchart-beta',");
    expect(out).toContain("    id: 'flowchart',");
  });

  it('gives a type with its own section and layout both, its own first (swimlane, D534)', () => {
    const manifest = {
      ...flowchart.manifest,
      types: ['flowchart-elk', 'flowchart-v2', 'swimlane'],
      typeOptions: {
        swimlane: { section: 'swimlane', layout: 'swimlane' },
        'flowchart-elk': { layout: 'elk' },
      },
    };
    const facets = generateFacets([{ ...flowchart, manifest }]);
    expect(facets).toContain("    section: 'swimlane',\n    baseSection: 'flowchart',");
    expect(facets.match(/baseSection/g)).toHaveLength(1);
    const rows = generateRegistry([{ ...flowchart, manifest }]);
    expect(rows).toMatch(/type: 'swimlane',[^}]*section: 'swimlane',\n {4}layout: 'swimlane',/);
    expect(rows).toMatch(/type: 'flowchart-elk',[^}]*layout: 'elk',/);
    expect(rows).not.toMatch(/type: 'flowchart-v2',[^}]*layout:/);
    expect(generateDetectors([{ ...flowchart, manifest }])).toContain(
      "formats: ['svg'], section: 'swimlane', layout: 'swimlane' },"
    );
    const stray = { ...manifest, typeOptions: { sequence: { layout: 'elk' } } };
    expect(() => generateRegistry([{ ...flowchart, manifest: stray }])).toThrow(
      /not one of its types/
    );
    const bad = (typeOptions: Record<string, { section?: string; layout?: string }>) => () =>
      generateRegistry([{ ...flowchart, manifest: { ...manifest, typeOptions } }]);
    expect(bad({ swimlane: { section: 'lanes' } })).toThrow(/"lanes" is not a config section/);
    expect(bad({ swimlane: { layout: 'lineHops' } })).toThrow(/"lineHops" is not a known layout/);
    expect(bad({ swimlane: { layout: 'nope' } })).toThrow(/not a known layout/);
    // A drawing part loads under a layout name but is no engine (#651).
    expect(bad({ swimlane: { layout: 'flowchartLanes' } })).toThrow(
      /"flowchartLanes" is not a known layout/
    );
    for (const layout of ['layered', 'dagre', 'tree', 'compass', 'swimlane', 'elk', 'elk.stress'])
      expect(bad({ swimlane: { layout } })).not.toThrow();
  });

  it('gives a type its own formats when it draws fewer than its package (spec #730)', () => {
    const manifest = {
      ...flowchart.manifest,
      types: ['flowchart-elk', 'flowchart-v2'],
      formats: ['svg', 'ascii'],
      typeOptions: { 'flowchart-elk': { formats: ['svg'] } },
    };
    const rows = generateRegistry([{ ...flowchart, manifest }]);
    expect(rows).toMatch(/type: 'flowchart-elk',[^}]*formats: \['svg'\],/);
    expect(rows).toMatch(/type: 'flowchart-v2',[^}]*formats: \['svg', 'ascii'\],/);
    expect(generateDetectors([{ ...flowchart, manifest }])).toMatch(
      /type: 'flowchart-elk',[^}]*formats: \['svg'\] \}/
    );
    const matrix = generateFormatMatrix([{ ...flowchart, manifest }]);
    expect(matrix).toContain('| `flowchart-elk` | `@x/diagram-flowchart` | yes | no |');
    expect(matrix).toContain('| `flowchart-v2` | `@x/diagram-flowchart` | yes | yes |');
    const bad = (formats: string[]) => () =>
      generateRegistry([
        { ...flowchart, manifest: { ...manifest, typeOptions: { 'flowchart-v2': { formats } } } },
      ]);
    expect(bad([])).toThrow(/formats must be some of the package's formats/);
    expect(bad(['png'])).toThrow(/formats must be some of the package's formats/);
    expect(bad(['ascii'])).not.toThrow();
  });

  it("reads mermaid's lazy engines from LAZY_LAYOUTS, parts and line hops left out (#651)", () => {
    const source = readFileSync(
      new URL('../../../packages/mermaid/src/registry.ts', import.meta.url),
      'utf8'
    );
    expect([...lazyEngines(source)].sort()).toEqual(['compass', 'swimlane', 'tree']);
    // Layout whitespace, quotes and comments do not matter.
    const reformatted = `
      const NOT_ENGINES: ReadonlySet<string> = new Set([
        LINE_HOPS,
        "part",
      ]);
      const LAZY_LAYOUTS = new Map<string, Loader>([
        // ['commented', () => import('x')],
        [
          "tree",
          () => import('t').then((m) => m.tree),
        ],
        ['part', () => import('p')],
        [LINE_HOPS, () => import('h')],
      ]);`;
    expect([...lazyEngines(reformatted)]).toEqual(['tree']);
    expect(() => lazyEngines('const LAZY_LAYOUTS = new Map([]);')).toThrow(/NOT_ENGINES/);
  });

  it('names the ids that have a facet in one union type', () => {
    expect(generateFacets([flowchart])).toContain("export type FirstPartyFacetId = 'flowchart';");
    const { language: _, ...manifest } = flowchart.manifest;
    expect(generateFacets([{ ...flowchart, manifest }])).toContain(
      'export type FirstPartyFacetId = never;'
    );
  });

  it('gives a type whose package has no language entry no loader', () => {
    const { language: _, ...manifest } = flowchart.manifest;
    const out = generateFacets([{ ...flowchart, manifest }]);
    expect(out).toContain("    id: 'flowchart',");
    expect(out).not.toContain('load:');
  });

  it('rejects a language entry no exports subpath serves', () => {
    expect(() => generateFacets([{ ...flowchart, exports: {} }])).toThrow(/no exports subpath/);
  });

  it('is up to date (run `pnpm gen:registry`)', () => {
    expect(readFileSync(FACETS_PATH, 'utf8')).toBe(generateFacets(readManifests()));
  });
});
