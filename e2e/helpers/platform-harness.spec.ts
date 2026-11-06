/**
 * Unit tests of the platform e2e harness (e2e/platform/harness): the fixture plugins'
 * manifests, which packages a pack brings along, and the package.json an install uses. The
 * pack, install and browser render themselves run in e2e/platform/pack-smoke.spec.ts.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readManifest } from '../../packages/core/src/index.ts';
import {
  FIXTURE_DIAGRAM,
  appEnv,
  FIXTURE_EXTENSION,
  installManifest,
  packageSources,
  partOf,
  packClosure,
  pnpmWorkspaceConfig,
} from '../platform/harness/index.ts';
import type { PackedPackage } from '../platform/harness/index.ts';
import { REPO_ROOT } from '../platform/harness/pack.ts';

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
      '@mermaid-js/diagram-journey',
      '@mermaid-js/diagram-pie',
      '@mermaid-js/diagram-quadrant',
      '@mermaid-js/diagram-radar',
      '@mermaid-js/diagram-sequence',
      '@mermaid-js/diagram-state',
      '@mermaid-js/diagram-timeline',
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

describe('appEnv', () => {
  it('runs the monorepo esbuild without the pnpm shim and its NODE_PATH', () => {
    const env = appEnv();
    expect(env.NODE_PATH).toBeUndefined();
    const out = execFileSync('sh', ['-c', 'command -v esbuild; echo "NODE_PATH=$NODE_PATH"'], {
      env,
      encoding: 'utf8',
    });
    const [path] = out.trim().split('\n');
    // The first esbuild is the real executable (a symlink to it), not the shell shim.
    expect(path).not.toContain(join('node_modules', '.bin'));
    expect(readFileSync(path, 'latin1')).not.toContain('export NODE_PATH');
    expect(out).toContain('NODE_PATH=\n');
  });

  describe('with a stale esbuild link in the cache', () => {
    const realEsbuild = realpathSync(join(REPO_ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild'));
    const saved = process.env.MERMAID_PLATFORM_CACHE;
    let cache: string;
    beforeEach(() => {
      cache = mkdtempSync(join(tmpdir(), 'mermaid-platform-cache-'));
      process.env.MERMAID_PLATFORM_CACHE = cache;
    });
    afterEach(() => {
      if (saved === undefined) delete process.env.MERMAID_PLATFORM_CACHE;
      else process.env.MERMAID_PLATFORM_CACHE = saved;
      rmSync(cache, { recursive: true, force: true });
    });

    const firstEsbuild = (): string =>
      execFileSync('sh', ['-c', 'command -v esbuild'], { env: appEnv(), encoding: 'utf8' }).trim();
    /** Points this checkout's cached link at `target`, as another run may have left it. */
    const replaceLink = (target: string): void => {
      const link = join(appEnv().PATH!.split(delimiter)[0], 'esbuild');
      expect(realpathSync(link)).toBe(realEsbuild);
      unlinkSync(link);
      symlinkSync(target, link);
    };

    it('replaces a dangling link (its worktree was deleted)', () => {
      replaceLink(join(cache, 'deleted-worktree', 'node_modules', 'esbuild', 'bin', 'esbuild'));
      const path = firstEsbuild();
      expect(path.startsWith(cache)).toBe(true);
      expect(readlinkSync(path)).toBe(realEsbuild);
    });

    it('replaces a link to some other esbuild', () => {
      replaceLink(realpathSync(process.execPath));
      expect(readlinkSync(firstEsbuild())).toBe(realEsbuild);
    });
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
