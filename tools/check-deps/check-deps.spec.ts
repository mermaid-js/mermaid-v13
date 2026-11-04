import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findBinImportViolations,
  findDependencyViolations,
  readBinSources,
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
