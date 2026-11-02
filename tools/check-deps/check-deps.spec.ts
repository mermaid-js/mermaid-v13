import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDependencyViolations, readWorkspace, type WorkspacePackage } from './check-deps.ts';

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
      '@mermaid-js/core: runtime dependency "khroma" is not allowed (core and diagram packages have zero runtime dependencies)',
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
      '@mermaid-js/diagram-pie: runtime dependency "d3" is not allowed (core and diagram packages have zero runtime dependencies)',
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

  it('holds for the real workspace', () => {
    const root = join(import.meta.dirname, '..', '..');
    const packages = readWorkspace(root);
    expect(packages.map((p) => p.manifest.name)).toContain('@mermaid-js/core');
    expect(findDependencyViolations(packages)).toEqual([]);
  });
});
