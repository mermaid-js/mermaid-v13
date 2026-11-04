/**
 * Third-party facet discovery (DESIGN §4.5, D89): `discoverFacets` over temp workspaces, then
 * the rows through the language service. A broken or missing manifest never throws.
 */
import { createLanguageService } from '@mermaid-js/language-service';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverFacets } from './discover.ts';
import { detectorSource, FAKE_FACET, facetPackage, workspace } from './testing/workspace.ts';

const codes = async (root: string, text: string) => {
  const service = createLanguageService({ facets: await discoverFacets(root) });
  await service.preload();
  return service
    .update('file:///x.mmd', text)
    .diagnostics()
    .map((d) => d.code);
};

describe('discoverFacets', () => {
  it('finds a package with a language manifest, scoped or not, and the service uses it', async () => {
    const root = workspace({
      'mermaid-fake': facetPackage('mermaid-fake', 'fake'),
      '@acme/diagram-other': facetPackage('@acme/diagram-other', 'other'),
    });
    const rows = await discoverFacets(root);
    expect(rows.map((r) => [r.type, r.id]).sort()).toEqual([
      ['fake', 'fake'],
      ['other', 'other'],
    ]);
    expect(await codes(root, 'fake\n')).toEqual(['FAKE_WARNING']);
    expect(await codes(root, 'other\n')).toEqual(['FAKE_WARNING']);
  });

  it("scans only the root's own node_modules, never a parent directory's", async () => {
    const root = workspace({ 'mermaid-fake': facetPackage('mermaid-fake', 'fake') });
    mkdirSync(join(root, 'src', 'deep'), { recursive: true });
    expect(await discoverFacets(join(root, 'src', 'deep'))).toEqual([]);
  });

  it('scans each of several roots', async () => {
    const a = workspace({ 'mermaid-a': facetPackage('mermaid-a', 'aaa') });
    const b = workspace({ 'mermaid-b': facetPackage('mermaid-b', 'bbb') });
    expect((await discoverFacets([a, b])).map((r) => r.id)).toEqual(['aaa', 'bbb']);
  });

  it('never lets a package take over a first-party id or type', async () => {
    const root = workspace({
      v2: facetPackage('v2', 'flowchart-v2', 'flowchart'),
      elk: facetPackage('elk', 'flowchart-elk', 'flowchart'),
      flow: facetPackage('flow', 'flowchart', 'flowchart'),
      seq: facetPackage('seq', 'sequence', 'sequenceDiagram'),
    });
    const log: string[] = [];
    expect(await discoverFacets(root, { log: (m) => log.push(m) })).toEqual([]);
    expect(log).toHaveLength(4);
    expect(await codes(root, 'flowchart LR\n  A --> B\n')).toEqual([]);
  });

  it('refuses detector and language paths outside the package, symlinks included', async () => {
    const outside = workspace({});
    writeFileSync(join(outside, 'detector.js'), detectorSource('esc'));
    writeFileSync(join(outside, 'language.js'), FAKE_FACET);
    const manifest = (name: string, detector: string, language: string) =>
      JSON.stringify({ name, mermaid: { plugin: 'diagram', id: name, detector, language } });
    const root = workspace({
      'up-detector': {
        'package.json': manifest('up-detector', '../../../../detector.js', './language.js'),
        'language.js': FAKE_FACET,
      },
      'abs-language': {
        'package.json': manifest('abs-language', './detector.js', join(outside, 'language.js')),
        'detector.js': detectorSource('abs'),
      },
      'link-detector': {
        'package.json': manifest('link-detector', './detector.js', './language.js'),
        'language.js': FAKE_FACET,
      },
      'link-language': {
        'package.json': manifest('link-language', './detector.js', './language.js'),
        'detector.js': detectorSource('link'),
      },
    });
    symlinkSync(join(outside, 'detector.js'), join(root, 'node_modules/link-detector/detector.js'));
    symlinkSync(join(outside, 'language.js'), join(root, 'node_modules/link-language/language.js'));
    const log: string[] = [];
    expect(await discoverFacets(root, { log: (m) => log.push(m) })).toEqual([]);
    expect(log.sort()).toEqual([
      'abs-language: "language" is outside the package',
      'link-detector: "detector" is outside the package',
      'link-language: "language" is outside the package',
      'up-detector: "detector" is outside the package',
    ]);
  });

  it('gives up on a detector or language module that never finishes loading', async () => {
    const hang = 'await new Promise(() => {});\n';
    const root = workspace({
      'slow-detector': { ...facetPackage('slow-detector', 'sd'), 'detector.js': hang },
      'slow-language': { ...facetPackage('slow-language', 'sl'), 'language.js': hang },
    });
    const log: string[] = [];
    const t = Date.now();
    const rows = await discoverFacets(root, { log: (m) => log.push(m), importTimeoutMs: 300 });
    expect(rows.map((r) => r.id)).toEqual(['sl']);
    expect(log).toEqual(['slow-detector: detector failed to load (timed out after 300 ms)']);
    const service = createLanguageService({ facets: rows });
    await service.preload();
    const d = service.update('file:///x.mmd', 'sl\n').diagnostics();
    expect(d.map((x) => x.code)).toEqual(['LANGUAGE_LOAD_FAILED']);
    expect(d[0]!.message).toContain('timed out');
    expect(Date.now() - t).toBeLessThan(3000);
  });

  it('skips broken and missing manifests without throwing, and says why', async () => {
    const good = facetPackage('good', 'good');
    const root = workspace({
      good,
      'not-json': { 'package.json': '{ "name": ' },
      'no-package-json': { 'index.js': '' },
      'string-manifest': { 'package.json': JSON.stringify({ name: 'x', mermaid: 'diagram' }) },
      'no-language': {
        'package.json': JSON.stringify({
          name: 'no-language',
          mermaid: { plugin: 'diagram', id: 'nl' },
        }),
      },
      'extension-only': {
        'package.json': JSON.stringify({
          name: 'ext',
          mermaid: { plugin: 'extension', id: 'ext' },
        }),
      },
      'no-detector': {
        'package.json': JSON.stringify({
          name: 'no-detector',
          mermaid: { plugin: 'diagram', id: 'nd', language: './language.js' },
        }),
        'language.js': FAKE_FACET,
      },
      'no-id': {
        'package.json': JSON.stringify({
          name: 'no-id',
          mermaid: { plugin: 'diagram', detector: './d.js', language: './language.js' },
        }),
      },
      'bad-language-path': {
        'package.json': JSON.stringify({
          name: 'bad-language-path',
          mermaid: { plugin: 'diagram', id: 'blp', detector: './d.js', language: 42 },
        }),
      },
      'missing-detector-file': {
        ...facetPackage('missing-detector-file', 'mdf'),
        'detector.js': undefined,
      },
      'throwing-detector': {
        ...facetPackage('throwing-detector', 'td'),
        'detector.js': 'throw new Error("boom");\n',
      },
      'detector-not-a-function': {
        ...facetPackage('detector-not-a-function', 'dnf'),
        'detector.js': 'export const detector = 1;\n',
      },
    });
    const log: string[] = [];
    const rows = await discoverFacets(root, { log: (m) => log.push(m) });
    expect(rows.map((r) => r.id)).toEqual(['good']);
    expect(log.join('\n')).toMatch(/not-json: unreadable package\.json/);
    expect(log.join('\n')).toMatch(/no-detector: the manifest has no "detector"/);
    expect(log.join('\n')).toMatch(/no-id: the manifest has no "id"/);
    expect(log.join('\n')).toMatch(/bad-language-path: "language" must be a module path/);
    expect(log.join('\n')).toMatch(/missing-detector-file: detector failed to load/);
    expect(log.join('\n')).toMatch(/throwing-detector: detector failed to load \(boom\)/);
    expect(log.join('\n')).toMatch(
      /detector-not-a-function: the detector module exports no function/
    );
    expect(log).toHaveLength(7);
  });

  it('gives a facet whose language module is missing LANGUAGE_LOAD_FAILED, not a throw', async () => {
    const root = workspace({
      broken: { ...facetPackage('broken', 'broken'), 'language.js': undefined },
      throws: { ...facetPackage('throws', 'throws'), 'language.js': 'throw new Error("no");\n' },
    });
    expect(await codes(root, 'broken\n')).toEqual(['LANGUAGE_LOAD_FAILED']);
    expect(await codes(root, 'throws\n')).toEqual(['LANGUAGE_LOAD_FAILED']);
  });

  it('skips a first-party id and a second package with an id already found', async () => {
    const root = workspace({
      'a-flow': facetPackage('a-flow', 'flowchart'),
      'b-fake': facetPackage('b-fake', 'fake'),
      'c-fake': { ...facetPackage('c-fake', 'fake'), 'detector.js': detectorSource('other') },
    });
    expect((await discoverFacets(root)).map((r) => r.id)).toEqual(['fake']);
    expect(await codes(root, 'fake\n')).toEqual(['FAKE_WARNING']);
  });

  it('returns nothing for a root that does not exist', async () => {
    expect(await discoverFacets(join(workspace({}), 'missing'))).toEqual([]);
  });

  it('detects third-party types with v12 detector text: directives and comments removed', async () => {
    const root = workspace({ 'mermaid-fake': facetPackage('mermaid-fake', 'fake') });
    expect(await codes(root, '%%{init: {}}%%\nfake\n')).toContain('FAKE_WARNING');
    expect(await codes(root, 'fake2\n')).not.toContain('FAKE_WARNING');
  });
});
