import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
    ['packages/diagram-er', '@mermaid-js/diagram-er', false],
    ['packages/diagram-sequence', '@mermaid-js/diagram-sequence', false],
    ['packages/mermaid', 'mermaid', false],
    ['packages/plugin-interactions', '@mermaid-js/plugin-interactions', false],
    ['packages/layout-elk', '@mermaid-js/layout-elk', false],
    ['packages/plugin-math', '@mermaid-js/plugin-math', false],
    ['packages/plugin-hand-drawn', '@mermaid-js/plugin-hand-drawn', false],
    ['packages/plugin-icons', '@mermaid-js/plugin-icons', false],
    ['packages/bundler-plugin', '@mermaid-js/bundler-plugin', false],
    ['packages/language-service', '@mermaid-js/language-service', false],
    ['packages/language-server', '@mermaid-js/language-server', false],
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
        './ascii',
        './config',
        './config/readers',
        './layout',
        './layout/compass',
        './layout/hops',
        './layout/swimlane',
        './layout/tree',
        './limits',
        './parser-kit',
        './parser-kit/facet',
        './preprocess',
        './svg',
        './svg/document',
        './svg/folded',
        './svg/framed',
        './svg/testing',
        './text',
        './theme',
        './timing',
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

  it('keeps the ELK package and elkjs out of core: no import, no dependency (D153, R-LAYOUT-7)', () => {
    const src = join(root, 'packages/core/src');
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.ts')
    );
    expect(files.length).toBeGreaterThan(0);
    const naming = files.filter((f) =>
      /layout-elk|['"]elkjs/.test(readFileSync(join(src, f), 'utf8'))
    );
    expect(naming).toEqual([]);
    expect(readFileSync(join(root, 'packages/core/package.json'), 'utf8')).not.toMatch(
      /layout-elk|elkjs/
    );
  });

  it('keeps the math package and MathJax out of core: no import, no dependency (D153, D178)', () => {
    const src = join(root, 'packages/core/src');
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.ts')
    );
    const naming = files.filter((f) =>
      /plugin-math|@mathjax\//.test(readFileSync(join(src, f), 'utf8'))
    );
    expect(naming).toEqual([]);
    expect(readFileSync(join(root, 'packages/core/package.json'), 'utf8')).not.toMatch(
      /plugin-math|mathjax/i
    );
  });

  it('runs every test, core included, in plain Node with no DOM shim (R-ARCH-1)', () => {
    expect(config.test?.environment).toBe('node');
    expect(config.test?.setupFiles).toBeUndefined();
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });
});
