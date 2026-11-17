/**
 * The plugin scan (D165, D589, R-PLUG-5): only the packages the app's package.json declares,
 * read from its own `node_modules`, every manifest path confined to its package (D157).
 * Nothing here runs package code, and nothing throws.
 */
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIRST_PARTY_IDS } from './generated/first-party-ids.gen.ts';
import { findAppRoot, packageModule, scanPlugins } from './scan.ts';
import { app, diagram, DETECTOR, ENTRY, pkg, skips } from './testing/apps.ts';

const names = async (root: string): Promise<string[]> =>
  (await scanPlugins(root)).packages.map((p) => p.package);

describe('scanPlugins: declared packages only (D589)', () => {
  it('finds only declared packages, not ones hoisted into node_modules', async () => {
    const root = app(
      { declared: diagram('declared', 'declared'), hoisted: diagram('hoisted', 'hoisted') },
      undefined,
      { name: 'app', dependencies: { declared: '1.0.0' } }
    );
    expect(await names(root)).toEqual(['declared']);
  });

  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])(
    'honours %s',
    async (field) => {
      const root = app({ 'mermaid-box': diagram('mermaid-box', 'box') }, undefined, {
        name: 'app',
        [field]: { 'mermaid-box': '1.0.0' },
      });
      expect(await names(root)).toEqual(['mermaid-box']);
    }
  );

  it('finds an npm alias under its key and reports the name in its own package.json', async () => {
    const root = app({ box: diagram('@acme/box', 'box') }, undefined, {
      name: 'app',
      dependencies: { box: 'npm:@acme/box@1.0.0' },
    });
    expect(await names(root)).toEqual(['@acme/box']);
  });

  it('finds scoped packages', async () => {
    const root = app({ '@acme/box': diagram('@acme/box', 'box') });
    expect(await names(root)).toEqual(['@acme/box']);
  });

  it('skips a declared package that is not installed, with no warning', async () => {
    const root = app({ ok: diagram('ok', 'ok') }, undefined, {
      name: 'app',
      dependencies: { ok: '1.0.0', '@acme/missing': '1.0.0' },
      optionalDependencies: { missing: '1.0.0' },
      peerDependencies: { 'also-missing': '1.0.0' },
    });
    expect(await scanPlugins(root)).toMatchObject({ packages: [{ package: 'ok' }], warnings: [] });
  });

  it('never looks outside node_modules for a dependency key', async () => {
    const root = app({}, undefined, {
      name: 'app',
      dependencies: { '../escape': '1.0.0', '@a/../../escape': '1.0.0', '.hidden': '1.0.0' },
    });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    for (const [file, text] of Object.entries(diagram('escape', 'escape'))) {
      mkdirSync(join(root, 'escape'), { recursive: true });
      writeFileSync(join(root, 'escape', file), text);
    }
    expect(await scanPlugins(root)).toEqual({ packages: [], warnings: [] });
  });

  it('finds a declared link: package symlinked from elsewhere, still confined (D157)', async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-link-')));
    for (const [file, text] of Object.entries(diagram('linked', 'linked')))
      writeFileSync(join(elsewhere, file), text);
    const root = app({}, undefined, {
      name: 'app',
      dependencies: { linked: `link:${elsewhere}` },
    });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    symlinkSync(elsewhere, join(root, 'node_modules', 'linked'));
    expect((await scanPlugins(root)).packages).toMatchObject([
      { package: 'linked', dir: elsewhere },
    ]);
    // A path out of the linked package's own folder is still skipped.
    const sub = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-link-')));
    const escaper = pkg(
      'escaper',
      {
        plugin: 'diagram',
        id: 'escaper',
        detector: '../outside.js',
        entry: './index.js',
        export: 'plugin',
      },
      { 'index.js': ENTRY('escaper') }
    );
    for (const [file, text] of Object.entries(escaper)) writeFileSync(join(sub, file), text);
    const root2 = app({}, undefined, { name: 'app', dependencies: { escaper: `link:${sub}` } });
    mkdirSync(join(root2, 'node_modules'), { recursive: true });
    symlinkSync(sub, join(root2, 'node_modules', 'escaper'));
    expect(skips((await scanPlugins(root2)).warnings)).toEqual([
      'escaper: "detector" is outside the package',
    ]);
  });

  it('discovers nothing and logs once when the root package.json is missing or unreadable', async () => {
    const root = app({ 'mermaid-box': diagram('mermaid-box', 'box') });
    expect(await names(root)).toEqual(['mermaid-box']);
    writeFileSync(join(root, 'package.json'), '{ "name": "app", ');
    const result = await scanPlugins(root);
    expect(result.packages).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ code: 'PLUGIN_DISCOVERY_NO_PACKAGE_JSON' });
    expect(result.warnings[0]?.message).toContain(root);
    const empty = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-empty-')));
    expect((await scanPlugins(empty)).warnings.map((w) => w.code)).toEqual([
      'PLUGIN_DISCOVERY_NO_PACKAGE_JSON',
    ]);
  });

  it('reports a root without node_modules once, naming the root', async () => {
    const root = app({});
    const { packages, warnings } = await scanPlugins(root);
    expect(packages).toEqual([]);
    expect(warnings).toMatchObject([{ code: 'PLUGIN_DISCOVERY_NO_MODULES' }]);
    expect(warnings[0]?.message).toContain(root);
  });

  it("never scans an ancestor folder's node_modules", async () => {
    const outer = app({ 'mermaid-box': diagram('mermaid-box', 'box') });
    const inner = app({}, join(outer, 'packages', 'inner'));
    expect((await scanPlugins(inner)).packages).toEqual([]);
  });

  it('sorts by package name in code-unit order, whatever the folder order', async () => {
    const root = app({
      'zz-plugin': diagram('zz-plugin', 'zz'),
      'Mm-plugin': diagram('Mm-plugin', 'mm'),
      'aa-plugin': diagram('aa-plugin', 'aa'),
    });
    expect(await names(root)).toEqual(['Mm-plugin', 'aa-plugin', 'zz-plugin']);
  });
});

describe('scanPlugins: confinement and skips (D157)', () => {
  it('skips paths outside the package, symlinks included, with a warning', async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-out-')));
    writeFileSync(join(elsewhere, 'detector.js'), DETECTOR('esc'));
    writeFileSync(join(elsewhere, 'index.js'), ENTRY('esc'));
    const manifest = (id: string, detector: string, entry = './index.js') => ({
      plugin: 'diagram',
      id,
      detector,
      entry,
      export: 'plugin',
    });
    const root = app({
      up: pkg('up', manifest('up', '../../../detector.js'), { 'index.js': ENTRY('up') }),
      abs: pkg('abs', manifest('abs', join(elsewhere, 'detector.js')), {
        'index.js': ENTRY('abs'),
      }),
      link: pkg('link', manifest('link', './detector.js'), { 'index.js': ENTRY('link') }),
      entry: pkg('entry', manifest('entry', './detector.js', '../../../index.js'), {
        'detector.js': DETECTOR('entry'),
      }),
      ok: diagram('ok', 'ok'),
    });
    symlinkSync(join(elsewhere, 'detector.js'), join(root, 'node_modules', 'link', 'detector.js'));
    const { packages, warnings } = await scanPlugins(root);
    expect(packages.map((p) => p.package)).toEqual(['ok']);
    expect(skips(warnings)).toEqual([
      'abs: "detector" is outside the package',
      'entry: "entry" is outside the package',
      'link: "detector" is outside the package',
      'up: "detector" is outside the package',
    ]);
    expect(warnings[0]).toMatchObject({ code: 'PLUGIN_SKIPPED', package: 'abs' });
  });

  it('confines a module path the scan does not read itself (packageModule, D577)', async () => {
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-out-')));
    writeFileSync(join(elsewhere, 'language.js'), '');
    const root = app({ ok: { ...diagram('ok', 'ok'), 'language.js': '', '..language.js': '' } });
    symlinkSync(join(elsewhere, 'language.js'), join(root, 'node_modules', 'ok', 'link.js'));
    const [ok] = (await scanPlugins(root)).packages;
    const at = (path: string) => packageModule(ok!, path, 'language');
    expect(await at('./language.js')).toEqual({ file: join(ok!.dir, 'language.js') });
    expect(await at('./..language.js')).toEqual({ file: join(ok!.dir, '..language.js') });
    const outside = { skip: '"language" is outside the package', missing: false };
    expect(await at('../language.js')).toEqual(outside);
    expect(await at(join(elsewhere, 'language.js'))).toEqual(outside);
    expect(await at('./link.js')).toEqual(outside);
    expect(await at('./gone.js')).toEqual({
      skip: '"language" (./gone.js) does not exist',
      missing: true,
    });
  });

  it('skips bad JSON and invalid or incomplete manifests, and never throws', async () => {
    const root = app({
      json: { 'package.json': '{ not json' },
      kind: pkg('kind', { plugin: 'theme', id: 'kind' }),
      nodetector: pkg('nodetector', { plugin: 'diagram', id: 'nodet', entry: './index.js' }),
      missing: pkg(
        'missing',
        { plugin: 'diagram', id: 'missing', detector: './nope.js', entry: './index.js' },
        { 'index.js': ENTRY('missing') }
      ),
      layout: pkg('layout', { plugin: 'layout', names: ['tree'], entry: './nope.js' }),
      plain: { 'package.json': JSON.stringify({ name: 'plain' }) },
      stray: {},
      ok: diagram('ok', 'ok'),
    });
    const { packages, warnings } = await scanPlugins(root);
    expect(packages.map((p) => p.package)).toEqual(['ok']);
    const messages = skips(warnings);
    expect(messages).toHaveLength(5);
    expect(messages[0]).toMatch(/^json: unreadable package\.json/);
    expect(messages.slice(1)).toEqual([
      'kind: Invalid mermaid plugin manifest: "plugin" must be "diagram", "extension" or "layout"',
      'layout: "entry" (./nope.js) does not exist',
      'missing: "detector" (./nope.js) does not exist',
      'nodetector: the manifest has no "detector"',
    ]);
  });

  it('leaves mermaid’s own packages out silently, and keeps a third party claiming their id', async () => {
    const root = app({
      'mermaid-flow': diagram('mermaid-flow', 'flowchart'),
      '@mermaid-js/diagram-flowchart': pkg('@mermaid-js/diagram-flowchart', {
        plugin: 'diagram',
        id: 'flowchart',
        detector: './detector.js',
        entry: './index.js',
        export: 'flowchart',
      }),
      mermaid: pkg('mermaid', undefined),
    });
    const { packages, warnings } = await scanPlugins(root, { firstPartyIds: FIRST_PARTY_IDS });
    expect(packages.map((p) => p.package)).toEqual(['mermaid-flow']);
    expect(warnings).toEqual([]);
  });

  it('lists the ids of the first-party diagrams', () => {
    expect(FIRST_PARTY_IDS).toEqual(expect.arrayContaining(['flowchart', 'sequence', 'pie']));
    expect(new Set(FIRST_PARTY_IDS).size).toBe(FIRST_PARTY_IDS.length);
  });
});

describe('findAppRoot', () => {
  it('finds the nearest package.json at or above the folder', async () => {
    const root = app({});
    mkdirSync(join(root, 'src', 'deep'), { recursive: true });
    expect(await findAppRoot(join(root, 'src', 'deep'))).toBe(root);
    expect(await findAppRoot(root)).toBe(root);
  });

  it('walks past type-marker package.json files', async () => {
    const root = app({});
    const out = join(root, 'dist', 'server');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(root, 'dist', 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(out, 'package.json'), '{"type":"module"}');
    expect(await findAppRoot(out)).toBe(root);
  });

  it('is undefined with no package.json above', async () => {
    expect(await findAppRoot('/')).toBeUndefined();
  });
});
