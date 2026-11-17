import { describe, expect, it } from 'vitest';
import {
  codeReferencePattern,
  failedTestsWarning,
  findRemote,
  isDocsPath,
  lintTargets,
  reportLines,
  typecheckSteps,
} from './plan.ts';

describe('findRemote', () => {
  const remotes = (...lines: string[]): string => lines.join('\n') + '\n';

  it('finds the remote by its URL, whatever it is called', () => {
    const knut = remotes(
      'mermaid-js\tgit@github.com:mermaid-js/mermaid-v13.git (fetch)',
      'mermaid-js\tgit@github.com:mermaid-js/mermaid-v13.git (push)',
      'origin\tgit@github.com:Mermaid-Chart/mermaid-v13.git (fetch)',
      'upstream\tgit@github.com:mermaid-js/mermaid.git (fetch)'
    );
    expect(findRemote(knut)).toBe('mermaid-js');
    expect(findRemote(remotes('origin\thttps://github.com/mermaid-js/mermaid-v13 (fetch)'))).toBe(
      'origin'
    );
    expect(
      findRemote(remotes('up\tssh://git@github.com/Mermaid-JS/mermaid-v13.git/ (fetch)'))
    ).toBe('up');
  });

  it('does not take a fork or the v12 repository for it', () => {
    const others = remotes(
      'origin\tgit@github.com:Mermaid-Chart/mermaid-v13.git (fetch)',
      'upstream\tgit@github.com:mermaid-js/mermaid.git (fetch)',
      'mirror\thttps://example.com/x/mermaid-js/mermaid-v13-fork.git (fetch)'
    );
    expect(findRemote(others)).toBeUndefined();
  });
});

describe('isDocsPath', () => {
  it('takes Markdown and the docs folders', () => {
    for (const path of [
      'AGENTS.md',
      'README.zh-CN.md',
      'docs/guide/intro.md',
      'v13/docs/DESIGN.md',
      'v13/docs/research/figure.svg',
      'packages/diagram-pie/README.md',
      '.claude/skills/release-alpha/SKILL.md',
    ])
      expect(isDocsPath(path), path).toBe(true);
  });

  it('leaves out Markdown that code reads, and code in a docs folder', () => {
    for (const path of [
      'packages/conformance/src/er/__snapshots__/er-errors.md',
      'packages/core/src/notes.md',
      'tools/release/fixtures/pkg/README.md',
      'packages/language-service/goldens/flowchart.md',
      'e2e/diagrams/pie/readme.md',
      '.changeset/brave-dogs-run.md',
      'v13/docs/agents/runs/265/ratios.mjs',
      'packages/core/src/index.ts',
      'package.json',
    ])
      expect(isDocsPath(path), path).toBe(false);
  });
});

describe('codeReferencePattern', () => {
  const matches = (path: string, line: string): boolean =>
    new RegExp(codeReferencePattern(path)).test(line);

  it('matches a string that names the file', () => {
    const path = 'v13/docs/DECISIONS.md';
    expect(matches(path, "const DECISIONS_FILE = 'v13/docs/DECISIONS.md';")).toBe(true);
    expect(matches(path, "new URL('../../../v13/docs/DECISIONS.md', import.meta.url)")).toBe(true);
    expect(matches(path, '// see v13/docs/DECISIONS.md')).toBe(false);
    expect(matches(path, "'v13/docs/DECISIONSxmd'")).toBe(false);
  });

  it('matches a string that names a folder the file is in', () => {
    const fragment = 'v13/docs/migration/pie.md';
    expect(matches(fragment, "export const MIGRATION_FRAGMENTS = 'v13/docs/migration';")).toBe(
      true
    );
    expect(matches('v13/docs/syntax/pie.md', 'syntaxDoc: `v13/docs/syntax/${grammar}.md`,')).toBe(
      true
    );
    expect(matches('v13/docs/syntax/pie.md', "'v13/docs/syntax/flowchart.md'")).toBe(false);
  });

  it('does not match on the docs roots themselves', () => {
    expect(matches('v13/docs/DESIGN.md', "ignore: ['v13/docs/**']")).toBe(false);
    expect(matches('docs/guide/intro.md', "'docs/'")).toBe(false);
    expect(matches('README.md', "'./'")).toBe(false);
  });
});

describe('lintTargets', () => {
  it('gives ESLint the script files and Prettier every file', () => {
    const files = ['packages/core/src/a.ts', 'tools/x.mjs', 'package.json', 'e2e/a.mmd'];
    expect(lintTargets(files)).toEqual({
      eslint: ['packages/core/src/a.ts', 'tools/x.mjs'],
      prettier: files,
    });
  });

  it('lints the whole tree when the list is too long for a command line', () => {
    const files = Array.from({ length: 2001 }, (_, i) => `packages/core/src/f${i}.ts`);
    expect(lintTargets(files)).toEqual({ eslint: ['.'], prettier: ['.'] });
  });
});

describe('typecheckSteps', () => {
  const root =
    'tsc -p tools/tsconfig.json && tsc -p e2e/dom/tsconfig.json && pnpm -r --parallel run typecheck';

  it('expands the root script into one tsc run per project', () => {
    const steps = typecheckSteps(root, [
      { dir: 'packages/core', typecheck: 'tsc -p tsconfig.json' },
      {
        dir: 'packages/dev',
        typecheck: 'tsc -p tsconfig.json && tsc -p ../../e2e/tsconfig.json',
      },
      { dir: 'packages/no-script' },
    ]);
    expect(steps).toEqual([
      { cwd: '.', project: 'tools/tsconfig.json', buildInfo: 'tools__tsconfig.json' },
      { cwd: '.', project: 'e2e/dom/tsconfig.json', buildInfo: 'e2e__dom__tsconfig.json' },
      {
        cwd: 'packages/core',
        project: 'tsconfig.json',
        buildInfo: 'packages__core__tsconfig.json',
      },
      { cwd: 'packages/dev', project: 'tsconfig.json', buildInfo: 'packages__dev__tsconfig.json' },
      {
        cwd: 'packages/dev',
        project: '../../e2e/tsconfig.json',
        buildInfo: 'packages__dev__..__..__e2e__tsconfig.json',
      },
    ]);
  });

  it('refuses a script it cannot run step by step, so that no step is skipped', () => {
    expect(() => typecheckSteps('tsc -p tools/tsconfig.json && node check.js', [])).toThrow(
      /node check\.js/
    );
    expect(() =>
      typecheckSteps(root, [{ dir: 'packages/core', typecheck: 'tsc --build' }])
    ).toThrow(/packages\/core/);
  });
});

describe('failedTestsWarning', () => {
  it('lists each failing test once', () => {
    const output = [
      ' ❯ |workspace| packages/core/src/a.spec.ts (3 tests | 1 failed) 12ms',
      '   × adds 4ms',
      ' FAIL  |workspace| packages/core/src/a.spec.ts > adds',
      ' FAIL  |workspace| packages/core/src/a.spec.ts > adds',
      'AssertionError: expected 1 to be 2',
    ].join('\n');
    expect(failedTestsWarning(output).split('\n')).toEqual([
      'tests the change reaches failed (a warning here; CI fails on them):',
      '    × adds 4ms',
      '    FAIL  |workspace| packages/core/src/a.spec.ts > adds',
    ]);
  });

  it('cuts a long list and says how many it left out', () => {
    const output = Array.from({ length: 25 }, (_, i) => ` FAIL  a.spec.ts > case ${i}`).join('\n');
    const lines = failedTestsWarning(output).split('\n');
    expect(lines).toHaveLength(22);
    expect(lines.at(-1)).toBe('    … and 5 more');
  });

  it('points at the log when vitest failed without naming a test', () => {
    expect(failedTestsWarning('Error: cannot start')).toContain('see the log');
  });
});

describe('reportLines', () => {
  const passed = { name: 'cspell', ok: true, output: 'fine', log: 'logs/cspell.log' };

  it('says nothing when every check passed without a warning', () => {
    expect(reportLines([passed])).toEqual([]);
  });

  it('reports every failed check with the end of its output, and every warning', () => {
    const long = Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const lines = reportLines([
      passed,
      { name: 'eslint', ok: false, output: 'a.ts: error', log: 'logs/eslint.log' },
      { name: 'knip', ok: false, output: long, log: 'logs/knip.log' },
      { ...passed, name: 'structural audit', warning: 'a test failed' },
    ]);
    expect(lines).toContain('Warning, structural audit: a test failed');
    expect(lines).toContain('── eslint failed (logs/eslint.log) ──');
    expect(lines).toContain('a.ts: error');
    expect(lines).toContain('… 5 lines above, in the log');
    expect(lines).not.toContain('line 5');
    expect(lines).toContain('line 6');
    expect(lines.at(-1)).toBe('pre-push: 2 of 4 checks failed: eslint, knip');
  });
});
