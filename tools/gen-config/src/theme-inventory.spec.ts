import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INVENTORY_PATH, themeInventory } from './theme-inventory.ts';

describe('theme variable inventory (DESIGN §8.3)', () => {
  it('lists name, CSS variable, role, rules, the themes that set it, and its users', async () => {
    const doc = await themeInventory();
    expect(doc).toContain(
      '| `primaryColor` | `--mermaid-primaryColor` | base | color | | | all | core, flowchart |'
    );
    expect(doc).toContain(
      '| `nodeBorder` | `--mermaid-nodeBorder` | derived | color | `primaryBorderColor` | `primaryBorderColor` | redux-dark, redux-dark-color, default, dark, forest, neutral | flowchart |'
    );
    expect(doc).toContain(
      '| `primaryBorderColor` | `--mermaid-primaryBorderColor` | derived | color | `mix(primaryColor, black, 15%)` | `mix(primaryColor, white, 20%)` | redux-color, redux, redux-dark, redux-dark-color | core, flowchart |'
    );
    expect(doc).toContain(
      '| `strokeWidth` | `--mermaid-strokeWidth` | token | length | | | all | core, flowchart |'
    );
  });

  it('lists the palettes and the themes that carry a non-empty one (D151)', async () => {
    const doc = await themeInventory();
    expect(doc).toContain(
      '| `borderColorArray` | `borderColorArray` | redux-color, redux-dark-color |'
    );
    expect(doc).toContain('| `bkgColorArray` | `bkgColorArray` | redux-color |');
    expect(doc).toContain(
      '| `cScale` | `cScale`, `cScale0`–`cScale11` | redux-color, redux-dark-color |'
    );
  });

  it('is up to date (run `pnpm gen:theme`)', async () => {
    expect(readFileSync(INVENTORY_PATH, 'utf8')).toBe(await themeInventory());
  });
});
