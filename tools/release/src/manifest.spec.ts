import { describe, expect, it } from 'vitest';
import {
  assertAlphaVersion,
  danglingExports,
  inexactWorkspaceRanges,
  publishManifest,
  workspaceLeaks,
} from './manifest.ts';
import type { PackedManifest } from './manifest.ts';

/** `packages/mermaid/package.json` after `pnpm pack` rewrote its workspace ranges. */
const mermaid = (): PackedManifest => ({
  name: 'mermaid',
  version: '13.0.0-alpha.3',
  license: 'MIT',
  exports: {
    '.': {
      'mermaid-source': './src/index.ts',
      types: './dist/index.d.ts',
      default: './dist/index.js',
    },
  },
  repository: { type: 'git', url: 'https://github.com/mermaid-js/mermaid' },
  dependencies: {
    '@mermaid-js/core': '^0.0.1-alpha.2',
    '@mermaid-js/diagram-flowchart': '^0.0.1-alpha.2',
  },
  devDependencies: { tsx: '^4.20.6', '@mermaid-js/conformance': 'workspace:*' },
});

const flowchart = (): PackedManifest => ({
  name: '@mermaid-js/diagram-flowchart',
  version: '0.0.1-alpha.2',
  peerDependencies: { '@mermaid-js/core': '^0.0.1-alpha.2' },
});

const WORKSPACE = ['mermaid', '@mermaid-js/core', '@mermaid-js/diagram-flowchart'];

describe('published manifests', () => {
  it('public: keeps names, drops the source export condition and devDependencies', () => {
    expect(publishManifest(mermaid(), { target: 'public', workspace: WORKSPACE })).toEqual({
      name: 'mermaid',
      version: '13.0.0-alpha.3',
      license: 'MIT',
      exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      repository: { type: 'git', url: 'https://github.com/mermaid-js/mermaid' },
      dependencies: {
        '@mermaid-js/core': '^0.0.1-alpha.2',
        '@mermaid-js/diagram-flowchart': '^0.0.1-alpha.2',
      },
    });
  });

  it('private: renames into @mermaid-chart and aliases workspace dependencies, so imports keep working', () => {
    const out = publishManifest(mermaid(), { target: 'private', workspace: WORKSPACE });
    expect(out.name).toBe('@mermaid-chart/mermaid');
    expect(out.dependencies).toEqual({
      '@mermaid-js/core': 'npm:@mermaid-chart/core@^0.0.1-alpha.2',
      '@mermaid-js/diagram-flowchart': 'npm:@mermaid-chart/diagram-flowchart@^0.0.1-alpha.2',
    });
    expect(out.repository).toEqual({
      type: 'git',
      url: 'https://github.com/Mermaid-Chart/mermaid-v13',
    });

    const peer = publishManifest(flowchart(), { target: 'private', workspace: WORKSPACE });
    expect(peer.name).toBe('@mermaid-chart/diagram-flowchart');
    expect(peer.peerDependencies).toEqual({
      '@mermaid-js/core': 'npm:@mermaid-chart/core@^0.0.1-alpha.2',
    });
  });

  it('finds workspace: ranges that would make a tarball uninstallable', () => {
    expect(workspaceLeaks(flowchart())).toEqual([]);
    expect(
      workspaceLeaks({
        name: 'x',
        version: '1.0.0',
        dependencies: { a: 'workspace:^' },
        peerDependencies: { b: 'npm:b@workspace:*' },
      })
    ).toEqual(['dependencies: a@workspace:^', 'peerDependencies: b@npm:b@workspace:*']);
  });

  it("finds ranges on the set's own packages that are not its exact version", () => {
    const versions = new Map([['@mermaid-js/core', '13.0.0-alpha.2']]);
    expect(
      inexactWorkspaceRanges(
        {
          name: 'mermaid',
          version: '13.0.0-alpha.2',
          dependencies: { '@mermaid-js/core': '13.0.0-alpha.2', other: '^1.0.0' },
        },
        versions
      )
    ).toEqual([]);
    expect(
      inexactWorkspaceRanges(
        {
          name: 'x',
          version: '13.0.0-alpha.2',
          peerDependencies: { '@mermaid-js/core': '^13.0.0-alpha.2' },
        },
        versions
      )
    ).toEqual(['peerDependencies: @mermaid-js/core@^13.0.0-alpha.2 (want exactly 13.0.0-alpha.2)']);
  });

  it('finds exports that point only at src/ and would publish with no target (#174)', () => {
    const manifest = publishManifest(
      {
        name: '@mermaid-js/language-service-monaco',
        version: '13.0.0-alpha.0',
        exports: {
          '.': { 'mermaid-source': './src/index.ts', default: './dist/index.js' },
          './monarch.json': { 'mermaid-source': './grammar/generated/monarch.json' },
          './source-only': './src/index.ts',
        },
      },
      { target: 'public', workspace: [] }
    );
    expect(danglingExports(manifest)).toEqual(['./monarch.json', './source-only']);
    expect(
      danglingExports(publishManifest(mermaid(), { target: 'public', workspace: [] }))
    ).toEqual([]);
  });

  it('drops the workspace-only test subpaths (`./testing`, `./testing/…`) that point only at src/ (#816)', () => {
    const manifest = publishManifest(
      {
        name: '@mermaid-js/diagram-pie',
        version: '13.0.0-alpha.3',
        exports: {
          '.': { 'mermaid-source': './src/index.ts', default: './dist/index.js' },
          './testing': { 'mermaid-source': './src/testing.ts' },
          './testing/layout-invariants': {
            'mermaid-source': './src/testing/layout-invariants.ts',
          },
        },
      },
      { target: 'public', workspace: [] }
    );
    expect(manifest.exports).toEqual({ '.': { default: './dist/index.js' } });
    expect(danglingExports(manifest)).toEqual([]);
  });

  it('keeps a test subpath that has a published target, so dropping one is never silent', () => {
    const manifest = publishManifest(
      {
        name: '@mermaid-js/core',
        version: '13.0.0-alpha.3',
        exports: {
          './svg/testing': { 'mermaid-source': './src/svg/testing.ts', default: './dist/x.js' },
          './testing-ish': { 'mermaid-source': './src/testing.ts' },
        },
      },
      { target: 'public', workspace: [] }
    );
    expect(manifest.exports).toEqual({
      './svg/testing': { default: './dist/x.js' },
      './testing-ish': {},
    });
    expect(danglingExports(manifest)).toEqual(['./testing-ish']);
  });

  it('publishes only alpha prereleases, so the alpha tag never moves latest or a release line', () => {
    expect(() => assertAlphaVersion(mermaid())).not.toThrow();
    for (const version of ['13.0.0', '13.0.0-beta.1', '11.16.0-b.4', '0.0.0'])
      expect(() => assertAlphaVersion({ name: 'mermaid', version }), version).toThrow(
        /not an alpha prerelease/
      );
  });
});
