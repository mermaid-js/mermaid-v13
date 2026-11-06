import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_VARIABLE_TABLE, THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { INVENTORY_PATH, TABLE_PATH, themeInventory, themeTable } from './theme-inventory.ts';

describe('theme variable inventory (DESIGN §8.3)', () => {
  it('lists name, CSS variable, role, rules, the themes that set it, and its users', async () => {
    const doc = await themeInventory();
    expect(doc).toContain(
      '| `primaryColor` | `--mermaid-primaryColor` | base | color | | | all | core |'
    );
    expect(doc).toContain(
      '| `nodeBorder` | `--mermaid-nodeBorder` | derived | color | `primaryBorderColor` | `primaryBorderColor` | redux-dark, redux-dark-color, default, dark, forest, neutral, neo | flowchart, sequence, class, state, er, timeline, mindmap |'
    );
    expect(doc).toContain(
      '| `primaryBorderColor` | `--mermaid-primaryBorderColor` | derived | color | `mix(primaryColor, black, 15%)` | `mix(primaryColor, white, 20%)` | redux-color, redux, redux-dark, redux-dark-color, neo, neo-dark | core |'
    );
    expect(doc).toContain(
      '| `strokeWidth` | `--mermaid-strokeWidth` | token | length | | | all | core, flowchart, sequence, class, state, er, timeline, mindmap |'
    );
  });

  it('lists the palettes and the themes that carry a non-empty one (D151)', async () => {
    const doc = await themeInventory();
    expect(doc).toContain(
      '| `borderColorArray` | `borderColorArray` | redux-color, redux-dark-color |'
    );
    expect(doc).toContain('| `bkgColorArray` | `bkgColorArray` | redux-color |');
    expect(doc).toContain('| `cScale` | `cScale`, `cScale0`–`cScale11` | all |');
    expect(doc).toContain(
      '| `cScaleLabel` | `cScaleLabel`, `cScaleLabel0`–`cScaleLabel11` | all |'
    );
  });

  it('gives every variable its own private alias', () => {
    const byAlias = new Map<string, string[]>();
    for (const [name, def] of Object.entries(THEME_VARIABLES))
      byAlias.set(def.alias, [...(byAlias.get(def.alias) ?? []), name]);
    expect([...byAlias.values()].filter((names) => names.length > 1)).toEqual([]);
  });

  it('is up to date (run `pnpm gen:theme`)', async () => {
    expect(readFileSync(INVENTORY_PATH, 'utf8')).toBe(await themeInventory());
  });

  it('keeps the runtime alias and kind table up to date (run `pnpm gen:theme`)', () => {
    expect(readFileSync(TABLE_PATH, 'utf8')).toBe(themeTable());
    const table = Object.entries(THEME_VARIABLE_TABLE);
    expect(table).toEqual(
      Object.entries(THEME_VARIABLES).map(([name, d]) => [name, { alias: d.alias, kind: d.kind }])
    );
  });
});
