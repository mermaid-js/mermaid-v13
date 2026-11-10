/**
 * The `usecase.theme` default and precedence against the 12.2.0 oracle (#567): with no theme
 * set, a usecase diagram takes `usecase.theme` (`redux-color`); a `theme` from `initialize()` or
 * the text wins over that default, and a `usecase.theme` an author sets wins over the top-level
 * `theme` of the same layer, as for gitGraph. v12's theme is read while its parser commits the
 * model, as v12's renderer would read it; v13's SVG must equal a render in that theme.
 */
import { describe, expect, it } from 'vitest';
import type { ThemeName } from '@mermaid-js/core/theme';
import { createMermaid } from 'mermaid';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { theme?: string };
  };
  parse(text: string): Promise<unknown>;
}

const oracle = await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

const SOURCE = 'usecase-beta\n  actor User\n  User --> Login\n';
const FRONT = (config: string) => `---\nconfig:\n${config}---\n`;

/** The theme v12 resolves for `text` under `initialize(config)`, read when the model commits. */
async function v12Theme(text: string, config: object): Promise<string | undefined> {
  const first = await oracle.parse(SOURCE);
  if (!first.accepted) throw new Error(first.error);
  const db = first.db as Record<string, (...args: unknown[]) => unknown>;
  const commit = db.commit!;
  let seen: string | undefined;
  db.commit = (...args) => {
    seen = v12.mermaidAPI.getConfig().theme;
    return commit(...args);
  };
  try {
    v12.mermaidAPI.reset();
    v12.mermaidAPI.initialize(config);
    await v12.parse(text);
  } finally {
    db.commit = commit;
  }
  return seen;
}

/** The SVG v13 draws for `text` under `initialize(config)`. */
async function v13Svg(text: string, config: object = {}): Promise<string> {
  const m = createMermaid();
  m.initialize(config);
  return (await m.render('u', text)).svg;
}

describe('usecase.theme against 12.2.0 (#567)', () => {
  it('takes usecase.theme (redux-color) when no theme is set; initialize() and the text win', async () => {
    const cases: { name: string; text: string; config: object; expected: ThemeName }[] = [
      { name: 'no theme', text: SOURCE, config: {}, expected: 'redux-color' },
      { name: 'initialize', text: SOURCE, config: { theme: 'dark' }, expected: 'dark' },
      {
        name: 'front matter',
        text: FRONT('  theme: forest\n') + SOURCE,
        config: {},
        expected: 'forest',
      },
      {
        name: 'front matter over initialize',
        text: FRONT('  theme: neutral\n') + SOURCE,
        config: { theme: 'dark' },
        expected: 'neutral',
      },
      {
        name: 'usecase.theme over the top level in initialize',
        text: SOURCE,
        config: { theme: 'default', usecase: { theme: 'dark' } },
        expected: 'dark',
      },
      {
        name: 'usecase.theme over the top level in the front matter',
        text: FRONT('  theme: default\n  usecase:\n    theme: forest\n') + SOURCE,
        config: {},
        expected: 'forest',
      },
    ];
    for (const { name, text, config, expected } of cases) {
      expect(await v12Theme(text, config), name).toBe(expected);
      expect(await v13Svg(text, config), name).toBe(await v13Svg(SOURCE, { theme: expected }));
    }
  });
});
