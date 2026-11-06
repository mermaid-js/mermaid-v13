import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findBinImportViolations,
  findDependencyViolations,
  findOptionalNameViolations,
  findOptionalPackages,
  readBinSources,
  readCoreSources,
  readWorkspace,
  type WorkspacePackage,
} from './check-deps.ts';

const pkg = (dir: string, manifest: WorkspacePackage['manifest']): WorkspacePackage => ({
  dir,
  manifest,
});

const core = pkg('packages/core', { name: '@mermaid-js/core' });
const flowchart = pkg('packages/diagram-flowchart', {
  name: '@mermaid-js/diagram-flowchart',
  peerDependencies: { '@mermaid-js/core': 'workspace:^' },
});

describe('runtime dependency check (R-PERF-2)', () => {
  it('passes a clean layout', () => {
    const mermaid = pkg('packages/mermaid', {
      name: 'mermaid',
      dependencies: {
        '@mermaid-js/core': 'workspace:^',
        '@mermaid-js/diagram-flowchart': 'workspace:^',
      },
    });
    expect(findDependencyViolations([core, flowchart, mermaid])).toEqual([]);
  });

  it('fails when core declares a runtime dependency', () => {
    const bad = pkg('packages/core', { name: '@mermaid-js/core', dependencies: { khroma: '^2' } });
    expect(findDependencyViolations([bad])).toEqual([
      '@mermaid-js/core: runtime dependency "khroma" is not allowed (core, diagram and language-service packages have zero runtime dependencies)',
    ]);
  });

  it('fails when the language service declares a runtime dependency (R-LANG-1)', () => {
    const bad = pkg('packages/language-service', {
      name: '@mermaid-js/language-service',
      dependencies: { '@mermaid-js/core': 'workspace:^' },
    });
    expect(findDependencyViolations([core, bad])).toEqual([
      '@mermaid-js/language-service: runtime dependency "@mermaid-js/core" is not allowed (core, diagram and language-service packages have zero runtime dependencies)',
    ]);
  });

  it('fails when an editor adapter declares a runtime dependency, even unpublished (R-LANG-2)', () => {
    const adapter = (deps: Record<string, string>) =>
      pkg('packages/language-service-codemirror', {
        name: '@mermaid-js/language-service-codemirror',
        private: true,
        dependencies: deps,
        peerDependencies: { '@codemirror/view': '^6', '@mermaid-js/core': 'workspace:^' },
      });
    expect(findDependencyViolations([core, adapter({})])).toEqual([]);
    expect(findDependencyViolations([core, adapter({ '@codemirror/view': '^6' })])).toEqual([
      '@mermaid-js/language-service-codemirror: runtime dependency "@codemirror/view" is not allowed (editor adapters take their editor and the service as peers)',
    ]);
  });

  it('fails when a diagram package depends on core at runtime instead of as a peer', () => {
    const bad = pkg('packages/diagram-flowchart', {
      name: '@mermaid-js/diagram-flowchart',
      dependencies: { '@mermaid-js/core': 'workspace:^' },
    });
    expect(findDependencyViolations([core, bad])).toHaveLength(1);
  });

  it('fails on optional dependencies and third-party peers', () => {
    const bad = pkg('packages/diagram-pie', {
      name: '@mermaid-js/diagram-pie',
      optionalDependencies: { d3: '^7' },
      peerDependencies: { dagre: '^1' },
    });
    expect(findDependencyViolations([core, bad])).toEqual([
      '@mermaid-js/diagram-pie: runtime dependency "d3" is not allowed (core, diagram and language-service packages have zero runtime dependencies)',
      '@mermaid-js/diagram-pie: peer dependency "dagre" is not a workspace package',
    ]);
  });

  it('fails when the public mermaid package pulls in a third-party package', () => {
    const bad = pkg('packages/mermaid', {
      name: 'mermaid',
      dependencies: { '@mermaid-js/core': 'workspace:^', dompurify: '^3' },
    });
    expect(findDependencyViolations([core, bad])).toEqual([
      'mermaid: runtime dependency "dompurify" is not a workspace package',
    ]);
  });

  it('ignores private packages such as the conformance oracle', () => {
    const conformance = pkg('packages/conformance', {
      name: '@mermaid-js/conformance',
      private: true,
      dependencies: { 'mermaid-v12': 'npm:mermaid@^12' },
    });
    expect(findDependencyViolations([core, conformance])).toEqual([]);
  });

  it('lets the language server depend on vscode-languageserver and nothing else third-party (D88)', () => {
    const server = pkg('packages/language-server', {
      name: '@mermaid-js/language-server',
      dependencies: {
        '@mermaid-js/core': 'workspace:^',
        'vscode-languageserver': '^11',
        chalk: '^5',
      },
    });
    expect(findDependencyViolations([core, server])).toEqual([
      '@mermaid-js/language-server: runtime dependency "chalk" is not a workspace package',
    ]);
    const other = pkg('packages/mermaid', {
      name: 'mermaid',
      dependencies: { 'vscode-languageserver': '^11' },
    });
    expect(findDependencyViolations([other])).toEqual([
      'mermaid: runtime dependency "vscode-languageserver" is not a workspace package',
    ]);
  });

  it('lets the ELK layout package depend on elkjs, and no other package (D171)', () => {
    const elk = pkg('packages/layout-elk', {
      name: '@mermaid-js/layout-elk',
      dependencies: { elkjs: '0.12.0', d3: '^7' },
      peerDependencies: { '@mermaid-js/core': 'workspace:*' },
    });
    expect(findDependencyViolations([core, elk])).toEqual([
      '@mermaid-js/layout-elk: runtime dependency "d3" is not a workspace package',
    ]);
    const other = pkg('packages/mermaid', { name: 'mermaid', dependencies: { elkjs: '0.12.0' } });
    expect(findDependencyViolations([other])).toEqual([
      'mermaid: runtime dependency "elkjs" is not a workspace package',
    ]);
  });

  it('lets the bundler plugin depend on unplugin, and mermaid not (D164)', () => {
    const plugin = pkg('packages/bundler-plugin', {
      name: '@mermaid-js/bundler-plugin',
      dependencies: { unplugin: '3.4.0', 'webpack-virtual-modules': '^0.6' },
    });
    expect(findDependencyViolations([core, plugin])).toEqual([
      '@mermaid-js/bundler-plugin: runtime dependency "webpack-virtual-modules" is not a workspace package',
    ]);
    const other = pkg('packages/mermaid', { name: 'mermaid', dependencies: { unplugin: '3.4.0' } });
    expect(findDependencyViolations([other])).toEqual([
      'mermaid: runtime dependency "unplugin" is not a workspace package',
    ]);
  });

  it('holds for the real workspace', () => {
    const root = join(import.meta.dirname, '..', '..');
    const packages = readWorkspace(root);
    expect(packages.map((p) => p.manifest.name)).toContain('@mermaid-js/core');
    expect(findDependencyViolations(packages)).toEqual([]);
  });
});

describe('bin import check (R-PERF-2, D85)', () => {
  const mermaid = pkg('packages/mermaid', {
    name: 'mermaid',
    bin: { mermaid: './dist/cli.js' },
    dependencies: { '@mermaid-js/core': 'workspace:^' },
  });
  const source = (text: string) => [{ pkg: mermaid, file: 'src/cli.ts', text }];

  it('passes node builtins, relative files and workspace packages', () => {
    const text = [
      "import { readFile } from 'node:fs/promises';",
      "import { createMermaid, type Warning } from './index.ts';",
      "export { x } from '@mermaid-js/core/ascii';",
      "const m = await import('./version.ts');",
    ].join('\n');
    expect(findBinImportViolations([core, mermaid], source(text))).toEqual([]);
  });

  it('fails on a third-party import, static, re-exported or dynamic', () => {
    const text = [
      "import yargs from 'yargs';",
      "import type { Chalk } from 'chalk';",
      "export * from 'commander';",
      "const m = await import('ora');",
      "import 'fs';",
    ].join('\n');
    expect(findBinImportViolations([core, mermaid], source(text))).toEqual(
      ['yargs', 'chalk', 'commander', 'ora', 'fs'].map(
        (dep) =>
          `mermaid: bin src/cli.ts imports "${dep}" (bins use node: builtins and workspace packages only)`
      )
    );
  });

  it('lets the language server bin import vscode-languageserver (D88)', () => {
    const server = pkg('packages/language-server', {
      name: '@mermaid-js/language-server',
      bin: { 'mermaid-language-server': './dist/cli.js' },
      dependencies: { 'vscode-languageserver': '^11' },
    });
    const text = [
      "import { createConnection } from 'vscode-languageserver/node';",
      "import yargs from 'yargs';",
    ].join('\n');
    expect(findBinImportViolations([server], [{ pkg: server, file: 'src/cli.ts', text }])).toEqual([
      '@mermaid-js/language-server: bin src/cli.ts imports "yargs" (bins use node: builtins and workspace packages only)',
    ]);
  });

  it('maps a bin from dist to its TypeScript source and holds for the real workspace', () => {
    const root = join(import.meta.dirname, '..', '..');
    const packages = readWorkspace(root);
    const sources = readBinSources(root, packages);
    expect(sources.map((s) => `${s.pkg.dir}/${s.file}`)).toContain('packages/mermaid/src/cli.ts');
    expect(findBinImportViolations(packages, sources)).toEqual([]);
  });
});

describe('optional packages stay out of core (R-PLUG-8, D153, D170)', () => {
  const peerOnCore = { '@mermaid-js/core': 'workspace:*' };
  const mermaid = pkg('packages/mermaid', {
    name: 'mermaid',
    dependencies: {
      '@mermaid-js/core': 'workspace:*',
      '@mermaid-js/diagram-flowchart': 'workspace:*',
    },
  });
  const flowchartPlugin = pkg('packages/diagram-flowchart', {
    name: '@mermaid-js/diagram-flowchart',
    peerDependencies: peerOnCore,
    mermaid: { plugin: 'diagram' },
  });
  const elk = pkg('packages/layout-elk', {
    name: '@mermaid-js/layout-elk',
    dependencies: { elkjs: '0.12.0' },
    peerDependencies: peerOnCore,
  });
  const math = pkg('packages/plugin-math', {
    name: '@mermaid-js/plugin-math',
    peerDependencies: peerOnCore,
    mermaid: { plugin: 'extension' },
  });
  const service = pkg('packages/language-service', {
    name: '@mermaid-js/language-service',
    peerDependencies: { ...peerOnCore, '@mermaid-js/diagram-flowchart': 'workspace:*' },
  });
  const bench = pkg('packages/bench', { name: '@mermaid-js/bench', private: true });
  const workspace = [core, flowchartPlugin, mermaid, elk, math, service, bench];
  const names = (ps: WorkspacePackage[]) => ps.map((p) => p.manifest.name);

  it('finds the published plugins mermaid does not ship, by manifest', () => {
    expect(names(findOptionalPackages(workspace))).toEqual([
      '@mermaid-js/layout-elk',
      '@mermaid-js/plugin-math',
    ]);
  });

  it('picks up a new plugin package with no code change (M4 icons, hand-drawn)', () => {
    const icons = pkg('packages/plugin-icons', {
      name: '@mermaid-js/plugin-icons',
      peerDependencies: peerOnCore,
    });
    const handDrawn = pkg('packages/look-hand-drawn', {
      name: '@mermaid-js/look-hand-drawn',
      peerDependencies: peerOnCore,
      mermaid: { plugin: 'extension' },
    });
    expect(names(findOptionalPackages([...workspace, icons, handDrawn]))).toEqual([
      '@mermaid-js/layout-elk',
      '@mermaid-js/plugin-math',
      '@mermaid-js/plugin-icons',
      '@mermaid-js/look-hand-drawn',
    ]);
  });

  it('stops counting a package as optional once mermaid ships it', () => {
    const shipping = pkg('packages/mermaid', {
      name: 'mermaid',
      dependencies: { ...mermaid.manifest.dependencies, '@mermaid-js/plugin-math': 'workspace:*' },
    });
    expect(names(findOptionalPackages([core, shipping, elk, math]))).toEqual([
      '@mermaid-js/layout-elk',
    ]);
  });

  it('passes core sources that name no optional package', () => {
    const sources = [
      { pkg: core, file: 'src/index.ts', text: "export { layout } from './layout/index.ts';" },
    ];
    expect(findOptionalNameViolations(workspace, sources)).toEqual([]);
  });

  it('fails a fixture core import of an optional package, static or dynamic', () => {
    const text = [
      "import { math } from '@mermaid-js/plugin-math';",
      "const elk = () => import('@mermaid-js/layout-elk/sync');",
    ].join('\n');
    expect(
      findOptionalNameViolations(workspace, [{ pkg: core, file: 'src/fixture.ts', text }])
    ).toEqual([
      '@mermaid-js/core: src/fixture.ts names optional package "@mermaid-js/layout-elk" (core never imports or names an optional package, D153)',
      '@mermaid-js/core: src/fixture.ts names optional package "@mermaid-js/plugin-math" (core never imports or names an optional package, D153)',
    ]);
  });

  it('fails core naming an optional package anywhere, a string or a comment', () => {
    const text = [
      "const name = '@mermaid-js/plugin-math';",
      '// install @mermaid-js/layout-elk for ELK',
    ].join('\n');
    expect(
      findOptionalNameViolations(workspace, [{ pkg: core, file: 'src/load.ts', text }])
    ).toHaveLength(2);
  });

  it('fails core declaring an optional package in its manifest', () => {
    const bad = pkg('packages/core', {
      name: '@mermaid-js/core',
      devDependencies: { '@mermaid-js/plugin-math': 'workspace:*' },
    });
    expect(findOptionalNameViolations([bad, mermaid, math], [])).toEqual([
      '@mermaid-js/core: package.json names optional package "@mermaid-js/plugin-math" (core never imports or names an optional package, D153)',
    ]);
  });

  it('holds for the real workspace: ELK, math and icons are optional, and core names none', () => {
    const root = join(import.meta.dirname, '..', '..');
    const packages = readWorkspace(root);
    expect(names(findOptionalPackages(packages))).toEqual(
      expect.arrayContaining([
        '@mermaid-js/layout-elk',
        '@mermaid-js/plugin-math',
        '@mermaid-js/plugin-icons',
      ])
    );
    const sources = readCoreSources(root, packages);
    expect(sources.map((s) => s.file)).toContain('src/index.ts');
    expect(findOptionalNameViolations(packages, sources)).toEqual([]);
  });
});
