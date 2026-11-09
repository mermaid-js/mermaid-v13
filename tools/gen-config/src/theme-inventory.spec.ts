import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_VARIABLE_TABLE, THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { INVENTORY_PATH, TABLE_PATH, themeInventory, themeTable } from './theme-inventory.ts';
import {
  generatedPath,
  packageTable,
  runtimeVars,
  themePackages,
  vocabularyCollisions,
  type ThemePackage,
} from './theme-packages.ts';

const REPO = await themePackages(undefined, { tables: 'vocabulary' });
/** A fixture `packages/` holding `diagram-demo` (a vocabulary and a table) and `diagram-plain`. */
const FIXTURES = fileURLToPath(new URL('./fixtures/packages', import.meta.url));
const [demo, plain] = (await themePackages(FIXTURES)) as [ThemePackage, ThemePackage];

describe('theme variable inventory (DESIGN §8.3)', () => {
  it('lists name, CSS variable, role, rules, the themes that set it, and its users', async () => {
    const doc = await themeInventory();
    expect(doc).toContain(
      '| `primaryColor` | `--mermaid-primaryColor` | base | color | | | all | core, quadrant, gitgraph, gantt, venn |'
    );
    expect(doc).toContain(
      '| `nodeBorder` | `--mermaid-nodeBorder` | derived | color | `primaryBorderColor` | `primaryBorderColor` | redux-dark, redux-dark-color, default, dark, forest, neutral, neo | flowchart, sequence, class, state, er, timeline, mindmap, gitgraph, kanban, requirement |'
    );
    expect(doc).toContain(
      '| `primaryBorderColor` | `--mermaid-primaryBorderColor` | derived | color | `mix(primaryColor, black, 15%)` | `mix(primaryColor, white, 20%)` | redux-color, redux, redux-dark, redux-dark-color, neo, neo-dark | core, quadrant, gantt |'
    );
    expect(doc).toContain(
      '| `strokeWidth` | `--mermaid-strokeWidth` | token | length | | | all | core, flowchart, sequence, class, state, er, timeline, mindmap, gitgraph, requirement |'
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
    expect(readFileSync(INVENTORY_PATH, 'utf8')).toBe(await themeInventory(REPO));
  });

  it('keeps the runtime alias and kind table up to date (run `pnpm gen:theme`)', () => {
    expect(readFileSync(TABLE_PATH, 'utf8')).toBe(themeTable());
    const table = Object.entries(THEME_VARIABLE_TABLE);
    expect(table).toEqual(
      Object.entries(THEME_VARIABLES).map(([name, d]) => [name, { alias: d.alias, kind: d.kind }])
    );
  });
});

describe('package theme vocabularies (spec #414 T0b)', () => {
  it('finds a package vocabulary and the table its plugin carries', () => {
    expect(demo.type).toBe('demo');
    expect(Object.keys(demo.vocabulary ?? {})).toEqual([
      'demoFill',
      'demoText',
      'demoGap',
      'demoPad',
      'demoOpacity',
      'demoOn',
      'demoSeries',
    ]);
    expect(demo.table?.section).toBe('demo');
    expect(plain).toEqual({ type: 'plain', dir: join(FIXTURES, 'diagram-plain') });
  });

  it("writes the package's alias and kind table in one pure call, without usedBy", async () => {
    const text = packageTable(demo.vocabulary!);
    expect(text).toContain('/* @__PURE__ */ table(');
    expect(text).not.toContain('usedBy:');
    // Its type import is erased, so the module runs from a scratch directory as it is.
    const dir = mkdtempSync(join(tmpdir(), 'gen-theme-'));
    try {
      writeFileSync(join(dir, 'variables.ts'), text);
      const mod = (await import(pathToFileURL(join(dir, 'variables.ts')).href)) as {
        THEME_VARIABLE_TABLE: unknown;
      };
      expect(mod.THEME_VARIABLE_TABLE).toEqual({
        demoFill: { alias: 'dmf', kind: 'color', nested: 'fill' },
        demoText: { alias: 'dmt', kind: 'color', nested: 'text' },
        demoGap: { alias: 'dmx', kind: 'length' },
        demoPad: { alias: 'dmp', kind: 'padding' },
        demoOpacity: { alias: 'dmo', kind: 'opacity' },
        demoOn: { alias: 'dmn', kind: 'flag' },
        demoSeries: { alias: 'dms', kind: 'palette', nested: 'series' },
      });
      expect(mod.THEME_VARIABLE_TABLE).toEqual(demo.table?.vars);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("documents each diagram variable's value per theme, resolved through its traits", async () => {
    const doc = await themeInventory([demo, plain]);
    expect(doc).toContain('## Diagram variables');
    expect(doc).toContain('### demo');
    expect(doc).not.toContain('### plain');
    expect(doc).toContain(
      '| Variable | Nested | Kind | redux-color | redux | redux-dark | redux-dark-color | default | dark | forest | neutral | base | neo | neo-dark |'
    );
    // classic tokens, redux tokens, and neo's own gap over the redux entries it falls back to.
    expect(doc).toContain(
      '| `demoGap` | | length | `8` | `8` | `8` | `8` | `4` | `4` | `4` | `4` | `4` | `6` | `6` |'
    );
    expect(doc).toContain(
      '| `demoOn` | | flag | `true` | `true` | `true` | `true` | `false` | `false` | `false` | `false` | `false` | `true` | `true` |'
    );
    // A palette variable's colours, comma-separated: the shared palette its rule names (D545).
    expect(doc).toMatch(
      /^\| `demoSeries` \| `demo\.series` \| palette \| `#FFF4DD,#FFD8B1,[^`]*` \|.* \| `#ECECFF,#8493A6,[^`]*` \|/m
    );
    // The nested form beside the flat name (D540); redux's dark value in the dark redux themes.
    expect(doc).toMatch(
      /^\| `demoFill` \| `demo\.fill` \| color \| `#ffffff` \| `#ffffff` \| `#222222` \| `#222222` \|/m
    );
  });

  it("adds each package's variables to the inventory, and nothing else (T1, T2)", async () => {
    const owners = REPO.filter((p) => p.vocabulary).map((p) => p.type);
    expect(owners).toEqual(
      expect.arrayContaining(['class', 'journey', 'pie', 'quadrant', 'sequence', 'timeline'])
    );
    const [core, all] = [await themeInventory(), await themeInventory(REPO)];
    expect(all.startsWith(core.trimEnd())).toBe(true);
    expect(all).toContain('| `classText` | | color |');
    expect(all).toContain('| `actorRadius` | | length |');
  });

  it("keeps every package's generated table up to date (run `pnpm gen:theme`)", () => {
    for (const { dir, vocabulary } of REPO)
      if (vocabulary)
        expect(readFileSync(generatedPath(dir), 'utf8')).toBe(packageTable(vocabulary));
  });

  it('keeps the runtime half equal to the vocabulary without usedBy', () => {
    expect(runtimeVars(demo.vocabulary!)).toEqual(demo.table?.vars);
  });
});

describe('first-party theme name uniqueness (D337)', () => {
  it('holds over core and every package', () => {
    expect(vocabularyCollisions(THEME_VARIABLES, [...REPO, demo])).toEqual([]);
  });

  it("fails on a name or alias that is core's or another package's, or a repeated nested key", () => {
    const other: Pick<ThemePackage, 'type' | 'vocabulary'> = {
      type: 'other',
      vocabulary: {
        demoFill: { alias: 'ozf', kind: 'color', usedBy: ['other'] },
        mainBkg: { alias: 'omb', kind: 'color', usedBy: ['other'] },
        otherA: { alias: 'dmx', kind: 'length', usedBy: ['other'] },
        otherB: { alias: 'p', kind: 'color', usedBy: ['other'] },
        otherC: { alias: 'oc', kind: 'color', usedBy: ['other'], nested: 'fill' },
        otherD: { alias: 'od', kind: 'color', usedBy: ['other'], nested: 'fill' },
      },
    };
    expect(vocabularyCollisions(THEME_VARIABLES, [demo, other])).toEqual([
      "other: `demoFill` is also demo's",
      "other: `mainBkg` is also core's",
      "other: `otherA`'s alias `dmx` is also demo's `demoGap`'s",
      "other: `otherB`'s alias `p` is also core's `primaryColor`'s",
      "other: `otherD`'s nested key `fill` is also `otherC`'s",
    ]);
  });
});
