import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../vitest.config.ts';

const root = join(import.meta.dirname, '..', '..');

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  exports?: Record<string, unknown>;
}

const readPackage = (dir: string): PackageJson =>
  JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as PackageJson;

describe('workspace layout (DESIGN §2)', () => {
  it.each([
    ['packages/core', '@mermaid-js/core', false],
    ['packages/diagram-flowchart', '@mermaid-js/diagram-flowchart', false],
    ['packages/mermaid', 'mermaid', false],
    ['packages/plugin-interactions', '@mermaid-js/plugin-interactions', false],
    ['packages/conformance', '@mermaid-js/conformance', true],
    ['packages/bench', '@mermaid-js/bench', true],
    ['tools/gen-metrics', '@mermaid-js/gen-metrics', true],
    ['tools/gen-config', '@mermaid-js/gen-config', true],
    ['tools/gen-grammar', '@mermaid-js/gen-grammar', true],
  ])('%s is the package %s (private: %s)', (dir, name, isPrivate) => {
    const pkg = readPackage(dir);
    expect(pkg.name).toBe(name);
    expect(pkg.private ?? false).toBe(isPrivate);
  });

  it('publishes mermaid as the next major, 13.x (R-COMPAT-1)', () => {
    expect(readPackage('packages/mermaid').version).toMatch(/^13\./);
  });

  it('exposes the core subpaths diagram packages build on', () => {
    expect(Object.keys(readPackage('packages/core').exports ?? {}).sort()).toEqual(
      [
        '.',
        './config',
        './layout',
        './parser-kit',
        './preprocess',
        './svg',
        './text',
        './theme',
      ].sort()
    );
  });

  it('carries no v12 diagram sources (R-ARCH-9)', () => {
    const tracked = execFileSync('git', ['ls-files', 'packages/mermaid/src/diagrams'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(tracked).toBe('');
    expect(existsSync(join(root, 'packages/parser/package.json'))).toBe(false);
  });

  it('runs every test, core included, in plain Node with no DOM shim (R-ARCH-1)', () => {
    expect(config.test?.environment).toBe('node');
    expect(config.test?.setupFiles).toBeUndefined();
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });
});
