import { describe, expect, it } from 'vitest';
import {
  assertAlphaVersion,
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

  it('publishes only alpha prereleases, so the alpha tag never moves latest or a release line', () => {
    expect(() => assertAlphaVersion(mermaid())).not.toThrow();
    for (const version of ['13.0.0', '13.0.0-beta.1', '11.16.0-b.4', '0.0.0'])
      expect(() => assertAlphaVersion({ name: 'mermaid', version }), version).toThrow(
        /not an alpha prerelease/
      );
  });
});
