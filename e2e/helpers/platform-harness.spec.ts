/**
 * Unit tests of the platform e2e harness (e2e/platform/harness): the fixture plugins'
 * manifests, which packages a pack brings along, and the package.json an install uses. The
 * pack, install and browser render themselves run in e2e/platform/pack-smoke.spec.ts.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readManifest } from '../../packages/core/src/index.ts';
import {
  FIXTURE_DIAGRAM,
  FIXTURE_EXTENSION,
  installManifest,
  packageSources,
  partOf,
  packClosure,
  pnpmWorkspaceConfig,
} from '../platform/harness/index.ts';
import type { PackedPackage } from '../platform/harness/index.ts';

const names = (list: readonly { name: string }[]): string[] => list.map((p) => p.name);

describe('fixture plugins', () => {
  it('has a third-party diagram with a valid manifest: detector and entry', () => {
    const { manifest } = packageSources().get(FIXTURE_DIAGRAM)!;
    expect(readManifest(manifest.mermaid)).toEqual({
      plugin: 'diagram',
      id: 'fixturebox',
      formats: ['svg'],
      detector: './detector.js',
      entry: './index.js',
      export: 'fixturebox',
    });
  });

  it('has an extension with a valid manifest', () => {
    const { manifest } = packageSources().get(FIXTURE_EXTENSION)!;
    expect(readManifest(manifest.mermaid)).toEqual({
      plugin: 'extension',
      id: 'fixture-mark',
      entry: './index.js',
      export: 'fixtureMark',
    });
  });

  it('ships the files its manifest names, and the detector matches its keyword', async () => {
    const { dir, manifest } = packageSources().get(FIXTURE_DIAGRAM)!;
    expect(manifest.files).toEqual(['index.js', 'detector.js']);
    const { detector } = (await import(join(dir, 'detector.js'))) as {
      detector: (text: string) => boolean;
    };
    expect(detector('fixturebox hello')).toBe(true);
    expect(detector('flowchart LR')).toBe(false);
  });
});

describe('packClosure', () => {
  it('brings every workspace package `mermaid` depends on, each before its dependents', () => {
    const list = names(packClosure(['mermaid']));
    expect([...list].sort()).toEqual([
      '@mermaid-js/core',
      '@mermaid-js/diagram-class',
      '@mermaid-js/diagram-er',
      '@mermaid-js/diagram-flowchart',
      '@mermaid-js/diagram-sequence',
      '@mermaid-js/diagram-state',
      'mermaid',
    ]);
    expect(list[0]).toBe('@mermaid-js/core');
    expect(list.at(-1)).toBe('mermaid');
  });

  it('follows peer dependencies and leaves out devDependencies', () => {
    // plugin-interactions has `mermaid` as a devDependency only.
    expect(names(packClosure(['@mermaid-js/plugin-interactions']))).toEqual([
      '@mermaid-js/core',
      '@mermaid-js/plugin-interactions',
    ]);
  });

  it('packs fixtures, which depend on nothing', () => {
    expect(names(packClosure([FIXTURE_DIAGRAM, FIXTURE_EXTENSION]))).toEqual([
      FIXTURE_DIAGRAM,
      FIXTURE_EXTENSION,
    ]);
  });

  it('refuses a package it cannot pack', () => {
    expect(() => packClosure(['@mermaid-js/dev'])).toThrow(/Not a packable package/);
  });
});

describe('installManifest', () => {
  const packed: PackedPackage[] = [
    { name: '@mermaid-js/core', version: '1.0.0', tarball: '/t/core.tgz', hash: 'a' },
    { name: 'mermaid', version: '1.0.0', tarball: '/t/mermaid.tgz', hash: 'b' },
  ];
  const app = {
    name: 'app',
    version: '0.0.0',
    dependencies: { mermaid: '13.0.0-alpha.0', other: '^1.0.0' },
  };

  it('points listed packages at their tarballs and the rest through npm overrides', () => {
    const m = installManifest(app, packed, 'npm');
    expect(m.dependencies).toEqual({ mermaid: 'file:/t/mermaid.tgz', other: '^1.0.0' });
    expect(m.overrides).toEqual({ '@mermaid-js/core': 'file:/t/core.tgz', mermaid: '$mermaid' });
  });

  it('leaves pnpm overrides out of package.json (pnpm reads pnpm-workspace.yaml)', () => {
    const m = installManifest(app, packed, 'pnpm');
    expect(m.dependencies).toEqual({ mermaid: 'file:/t/mermaid.tgz', other: '^1.0.0' });
    expect(m.overrides).toBeUndefined();
  });

  it('writes pnpm overrides and lets esbuild run its install script (pnpm 11+ fail otherwise)', () => {
    const local = packed.map((p) => ({ ...p, tarball: `./tarballs/${p.name}.tgz` }));
    const config = pnpmWorkspaceConfig({ overrides: { x: '1.0.0' } }, local);
    expect(config.overrides).toEqual({
      x: '1.0.0',
      '@mermaid-js/core': 'file:./tarballs/@mermaid-js/core.tgz',
      mermaid: 'file:./tarballs/mermaid.tgz',
    });
    expect(config.allowBuilds).toEqual({ esbuild: true });
  });
});

describe('chunk parts (bundle spec)', () => {
  it('maps the source paths of each bundler and package manager to a part', () => {
    const pnpm = 'node_modules/.pnpm/@mermaid-js+diagram-class@file+tarballs+x.tgz/node_modules';
    expect(
      [
        '../../node_modules/mermaid/dist/index.js',
        '../../node_modules/mermaid/dist/ascii.js',
        `webpack://app/./${pnpm}/@mermaid-js/diagram-class/dist/index.js`,
        `../${pnpm}/@mermaid-js/core/dist/ascii/draw.js`,
        '../node_modules/@mermaid-js/diagram-er/dist/ascii.js',
        '../node_modules/@mermaid-js/diagram-state/dist/language.js',
        '../node_modules/@mermaid-js/language-service/dist/index.js',
        '../node_modules/@mermaid-js/diagram-flowchart/dist/testing.js',
        '../node_modules/@mermaid-js/core/dist/layout/index.js',
        '../node_modules/d3/src/index.js',
        'webpack://app/webpack/runtime/load script',
        '\0vite/preload-helper.js',
        '../../src/flowchart.js',
      ].map(partOf)
    ).toEqual([
      'core',
      'ascii',
      'diagram:class',
      'ascii',
      'ascii',
      'language',
      'language',
      'testing',
      'core',
      'package:d3',
      'app',
      'app',
      'app',
    ]);
  });
});
