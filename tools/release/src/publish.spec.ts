import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackedManifest } from './manifest.ts';
import { REGISTRIES, packAll, publishAll } from './publish.ts';
import type { Exec, PackedTarball } from './publish.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const manifestOf = (tarball: string) =>
  JSON.parse(
    execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' })
  ) as PackedManifest;

describe('packAll (this workspace)', () => {
  it('packs the published packages, dependencies first, with private-registry manifests', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'release-pack-'));
    // The workspace is not versioned to an alpha until `changeset version` runs in CI.
    const packed = packAll(root, { target: 'private', outDir, requireAlpha: false });
    const names = packed.map((p) => p.name);
    expect(names).toEqual([
      '@mermaid-chart/core',
      '@mermaid-chart/diagram-flowchart',
      '@mermaid-chart/language-service',
      '@mermaid-chart/plugin-interactions',
      '@mermaid-chart/mermaid',
    ]);
    const mermaid = manifestOf(packed[4]!.tarball);
    expect(mermaid.name).toBe('@mermaid-chart/mermaid');
    expect(mermaid.dependencies?.['@mermaid-js/core']).toMatch(/^npm:@mermaid-chart\/core@\^/);
    expect(JSON.stringify(mermaid)).not.toContain('workspace:');
    expect(JSON.stringify(mermaid)).not.toContain('mermaid-source');
  }, 60_000);

  it('refuses to pack a version that is not an alpha prerelease', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'release-pack-'));
    expect(() => packAll(root, { target: 'public', outDir })).toThrow(/not an alpha prerelease/);
  });
});

describe('publishAll', () => {
  const tarballs: PackedTarball[] = [
    { name: '@mermaid-js/core', version: '0.0.1-alpha.2', tarball: '/t/core.tgz' },
    { name: 'mermaid', version: '13.0.0-alpha.3', tarball: '/t/mermaid.tgz' },
  ];

  /** Records npm calls; `npm view` finds only the versions in `published`. */
  function fakeNpm(published: string[]) {
    const calls: string[][] = [];
    const exec: Exec = (args) => {
      calls.push(args);
      if (args[0] === 'view') {
        if (published.includes(args[1]!)) return args[1]!.split('@').pop()!;
        throw new Error('E404');
      }
      return '';
    };
    return { calls, exec };
  }

  it('publishes each new version with the alpha tag, and skips versions already published', () => {
    const npm = fakeNpm(['@mermaid-js/core@0.0.1-alpha.2']);
    const result = publishAll(tarballs, { registry: REGISTRIES.public, exec: npm.exec });
    expect(result).toEqual({
      published: ['mermaid@13.0.0-alpha.3'],
      skipped: ['@mermaid-js/core@0.0.1-alpha.2'],
    });
    expect(npm.calls.filter((c) => c[0] === 'publish')).toEqual([
      [
        'publish',
        '/t/mermaid.tgz',
        '--tag',
        'alpha',
        '--registry',
        'https://registry.npmjs.org/',
        '--access',
        'public',
        '--provenance',
      ],
    ]);
  });

  it('publishes to GitHub Packages without provenance', () => {
    const npm = fakeNpm([]);
    publishAll(tarballs.slice(0, 1), { registry: REGISTRIES.private, exec: npm.exec });
    expect(npm.calls.at(-1)).toEqual([
      'publish',
      '/t/core.tgz',
      '--tag',
      'alpha',
      '--registry',
      'https://npm.pkg.github.com/',
    ]);
  });

  it('dry run: looks nothing up and publishes nothing', () => {
    const npm = fakeNpm([]);
    const result = publishAll(tarballs, {
      registry: REGISTRIES.private,
      exec: npm.exec,
      dryRun: true,
    });
    expect(npm.calls).toEqual([]);
    expect(result.published).toEqual(['@mermaid-js/core@0.0.1-alpha.2', 'mermaid@13.0.0-alpha.3']);
  });
});

describe('release:publish CLI', () => {
  const cli = join(import.meta.dirname, 'publish-cli.ts');
  const runCli = (args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    });

  it('refuses a public publish without a bench report', () => {
    const out = runCli(['--target', 'public', '--dry-run']);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('Public publish refused');
  });

  it('refuses a public publish while a R-PERF gate fails, before packing anything', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-cli-'));
    const report = join(dir, 'latest.json');
    writeFileSync(
      report,
      JSON.stringify({
        schema: 1,
        createdAt: '2026-11-02T00:00:00Z',
        runner: 'test',
        options: {},
        pipeline: { present: true, reason: 'ok' },
        renderers: [],
      })
    );
    const out = runCli([
      '--target',
      'public',
      '--gate',
      report,
      '--out',
      join(dir, 'out'),
      '--dry-run',
    ]);
    expect(out.status).toBe(1);
    expect(out.stdout).toContain('Public alpha publish refused');
    expect(out.stdout).not.toContain('packed');
    expect(existsSync(join(dir, 'out'))).toBe(false);
  });
});
