import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DiagramPlugin } from '@mermaid-js/core';
import { dedent } from './dom.ts';
import { createMermaid } from './index.ts';
import { VERSION } from './version.ts';

describe('run() text cleaning (v12 ts-dedent)', () => {
  it('keeps indentation relative to the least-indented line, counting only blanks', () => {
    expect(dedent('mindmap\nroot\n  child\n    grandchild')).toBe(
      'mindmap\nroot\n  child\n    grandchild'
    );
    expect(dedent('\n    flowchart LR\n      A["one\n        two"]\n    ')).toBe(
      'flowchart LR\n  A["one\n    two"]'
    );
  });
});

describe('third-party detectors (DESIGN §12.1)', () => {
  const foo = (seen: { text?: string; config?: unknown }): DiagramPlugin => ({
    id: 'foo',
    layoutKind: 'custom',
    detector(text, config) {
      seen.text = text;
      seen.config = config;
      return /^\s*foo/.test(text);
    },
    parse: () => ({ model: {}, diagnostics: [] }) as never,
    render: () => undefined as never,
  });

  it('see the text without front matter, directives and comments, and the config', async () => {
    const seen: { text?: string; config?: unknown } = {};
    const m = createMermaid();
    m.initialize({ theme: 'dark' });
    await m.registerExternalDiagrams([foo(seen)]);
    expect(m.detectType('---\ntitle: x\n---\nfoo\n  a')).toBe('foo');
    expect(m.detectType('%%{init: {}}%%\n%% a comment\nfoo\n  a')).toBe('foo');
    expect(seen.text).not.toContain('%%');
    expect(seen.config).toMatchObject({ theme: 'dark' });
  });

  it('rejects a diagram plugin that is missing a member, naming it', async () => {
    const m = createMermaid();
    await expect(
      m.registerExternalDiagrams([{ id: 'bad', parse: () => ({}), render: () => '' } as never])
    ).rejects.toThrow(/Diagram "bad": detector must be a function/);
    await expect(
      m.registerExternalDiagrams([
        { id: 'typo', detector: () => false, parse: () => ({}), rendr: 1 } as never,
      ])
    ).rejects.toThrow(/Diagram "typo": render must be a function/);
    expect(() => m.detectType('zzz')).toThrow(/No diagram type detected/);
  });
});

describe('preload (R-API-2)', () => {
  it('loads the dark spec for theme: auto', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'auto' });
    await m.preload({ types: ['flowchart'], themes: ['auto'] });
    expect(m.renderSync('flowchart LR\n  A --> B').svg).toContain('<svg');
  });

  it('loads the text entry with formats: ["ascii"]', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'], formats: ['ascii'] });
    expect(m.renderSync('flowchart LR\n  A --> B', { format: 'ascii' }).text).toContain('A');
  });
});

describe('package', () => {
  it('writes the package.json version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(VERSION).toBe(pkg.version);
  });
});
