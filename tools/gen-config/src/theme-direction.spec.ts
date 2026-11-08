import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DiagramThemeTable } from '../../../packages/core/src/theme/diagram.ts';
import { THEME_NAMES, THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { D332_INPUTS } from '../../../packages/conformance/src/diagram-themes.ts';
import {
  checkThemeDirection,
  packageGraph,
  unreadInputs,
  type DirectionInput,
} from './theme-direction.ts';
import { PACKAGES, themePackages, type ThemePackage } from './theme-packages.ts';

/**
 * D331: dependencies between themes and diagrams run one way (spec #414). The check runs over the
 * repository, and each rule fails on a planted violation.
 */
const DIAGRAMS = readdirSync(PACKAGES).filter((d) => d.startsWith('diagram-'));

/**
 * Each diagram package's vocabulary (`src/theme/vocabulary.ts`) and its plugin's
 * `DiagramPlugin.theme`, by type.
 */
const PACKAGE_THEMES = await themePackages(PACKAGES);
const tables = (pkgs: readonly ThemePackage[]) =>
  Object.fromEntries(pkgs.flatMap((p) => (p.table ? [[p.type, p.table]] : [])));
const vocabularies = (pkgs: readonly ThemePackage[]) =>
  Object.fromEntries(pkgs.flatMap((p) => (p.vocabulary ? [[p.type, p.vocabulary]] : [])));

const repo: DirectionInput = {
  tables: tables(PACKAGE_THEMES),
  vocabularies: vocabularies(PACKAGE_THEMES),
  shared: new Set(Object.keys(THEME_VARIABLES)),
  themes: THEME_NAMES,
  core: [...packageGraph(join(PACKAGES, 'core')), ...packageGraph(join(PACKAGES, 'mermaid'))],
  diagrams: Object.fromEntries(
    DIAGRAMS.map((d) => [d.slice('diagram-'.length), packageGraph(join(PACKAGES, d))])
  ),
};

/** The fixture package (`fixtures/packages/diagram-demo`): a vocabulary and a matching table. */
const FIXTURES = fileURLToPath(new URL('./fixtures/packages', import.meta.url));
const FIXTURE_THEMES = await themePackages(FIXTURES);

const TABLE: DiagramThemeTable = {
  vars: { demoFill: { alias: 'dmf', kind: 'color' } },
  rules: { light: { demoFill: 'mix(mainBkg, cScale2, 10%)' } },
  families: { redux: { values: { demoFill: '#ffffff' } } },
};
const planted = (over: Partial<DirectionInput>): DirectionInput => ({
  tables: { demo: TABLE },
  shared: repo.shared,
  themes: THEME_NAMES,
  core: [],
  diagrams: {},
  ...over,
});
const file = (text: string, path = 'x.ts') => ({ path, text });

describe('theme direction (D331)', () => {
  it('finds a package vocabulary and its table', () => {
    expect(Object.keys(vocabularies(FIXTURE_THEMES))).toEqual(['demo']);
    expect(Object.keys(tables(FIXTURE_THEMES))).toEqual(['demo']);
  });

  it('walks every runtime graph', () => {
    expect(repo.core.some((f) => f.path.endsWith('theme/specs/redux-color.ts'))).toBe(true);
    expect(repo.core.some((f) => f.path.endsWith('.spec.ts'))).toBe(false);
    expect(Object.keys(repo.diagrams).length).toBe(DIAGRAMS.length);
    for (const files of Object.values(repo.diagrams)) expect(files.length).toBeGreaterThan(0);
  });

  it('holds over the repository', () => {
    expect(checkThemeDirection(repo)).toEqual([]);
  });

  it('accepts a table that reads shared names, slots and its own vars', () => {
    expect(checkThemeDirection(planted({}))).toEqual([]);
  });

  it('fails when core or a theme spec names a diagram variable', () => {
    const v = checkThemeDirection(
      planted({ core: [file("const r = { x: 'mix(demoFill, black, 10%)' };", 'specs/x.ts')] })
    );
    expect(v).toEqual([{ rule: 'core-names-diagram', where: 'specs/x.ts', name: 'demoFill' }]);
  });

  it('fails when core names a diagram variable as a property or property access', () => {
    const v = checkThemeDirection(
      planted({
        core: [
          file('const a = { values: { demoFill: 1 } };', 'key.ts'),
          file("const b = { 'demoFill': 1 };", 'quoted.ts'),
          file('const demo = 1; const c = { demoFill };', 'shorthand.ts'),
          file('const d = t.vars.demoFill;', 'access.ts'),
          file('// demoFill is the fill\n/* t.vars.demoFill */ const e = 1;', 'comment.ts'),
        ],
      })
    );
    expect(v).toEqual(
      ['key.ts', 'quoted.ts', 'shorthand.ts', 'access.ts'].map((where) => ({
        rule: 'core-names-diagram',
        where,
        name: 'demoFill',
      }))
    );
  });

  // The oracle specs leave D332's inputs out of their v12 comparison, so each must be read by a
  // table, where the diagram variable that reads it is compared. plotColorArray waits for xychart
  // (D381).
  it('reads every shared input from some table', () => {
    const inputs = D332_INPUTS.filter((n) => n !== 'plotColorArray');
    expect(unreadInputs(repo.tables, inputs)).toEqual([]);
    expect(unreadInputs(repo.tables, ['plotColorArray'])).toEqual(['plotColorArray']);
    const t = { demo: TABLE };
    expect(unreadInputs(t, ['mainBkg', 'cScale', 'mutedBkg'])).toEqual(['mutedBkg']);
  });

  it("lets a palette variable's rule name a shared palette, which counts as read (D545)", () => {
    const table: DiagramThemeTable = {
      vars: { demoSeries: { alias: 'dms', kind: 'palette' } },
      rules: { light: { demoSeries: 'plotColorArray' } },
      families: { neo: { rules: { demoSeries: 'nopeArray' } } },
    };
    expect(checkThemeDirection(planted({ tables: { demo: table } }))).toEqual([
      { rule: 'table-reads-foreign', where: 'demo rules', name: 'nopeArray' },
    ]);
    expect(unreadInputs({ demo: table }, ['plotColorArray'])).toEqual([]);
  });

  it('fails when a diagram names a theme', () => {
    const v = checkThemeDirection(
      planted({
        diagrams: {
          demo: [
            file("const neo = look === 'neo' || REDUX.has('redux-dark');"),
            file("if (config.theme === 'dark') draw();", 'b.ts'),
            file('const n = ctx.theme.name;', 'c.ts'),
          ],
        },
      })
    );
    expect(v.map((x) => x.name)).toEqual(['neo', 'redux-dark', 'dark', 'theme.name']);
  });

  it('lets a diagram use the words that are also theme names', () => {
    const v = checkThemeDirection(
      planted({
        diagrams: {
          demo: [
            file("const c = ['default', ...classes]; const s = level ?? 'default';"),
            file('export const D = { "theme": "redux-color" };', 'pkg/src/generated/defaults.ts'),
          ],
        },
      })
    );
    expect(v).toEqual([]);
  });

  it("fails when a table reads another diagram's variable or writes a name not its own", () => {
    const other: DiagramThemeTable = {
      vars: { otherFill: { alias: 'otf', kind: 'color' } },
      rules: { light: { otherFill: 'demoFill', mainBkg: 'red' } },
    };
    const v = checkThemeDirection(planted({ tables: { demo: TABLE, other } }));
    expect(v).toEqual([
      { rule: 'table-reads-foreign', where: 'other rules', name: 'demoFill' },
      { rule: 'table-writes-foreign', where: 'other entries', name: 'mainBkg' },
    ]);
  });

  it("fails when a table's name is core's or another table's", () => {
    const dup: DiagramThemeTable = {
      vars: { demoFill: { alias: 'x', kind: 'color' }, mainBkg: { alias: 'y', kind: 'color' } },
      rules: { light: {} },
    };
    const v = checkThemeDirection(planted({ tables: { demo: TABLE, dup } }));
    expect(v.map((x) => x.name).sort()).toEqual(['demoFill', 'mainBkg']);
    expect(new Set(v.map((x) => x.rule))).toEqual(new Set(['table-name-collision']));
  });

  it("accepts a package whose table declares its vocabulary's variables", () => {
    const pkg = FIXTURE_THEMES[0]!;
    expect(packageGraph(pkg.dir).some((f) => f.text.includes("fallback: 'redux'"))).toBe(true);
    const v = checkThemeDirection(
      planted({
        tables: tables(FIXTURE_THEMES),
        vocabularies: vocabularies(FIXTURE_THEMES),
        // Its own files: the fixture reaches core by relative type imports, a port by package name.
        diagrams: { demo: packageGraph(pkg.dir).filter((f) => f.path.startsWith(pkg.dir)) },
      })
    );
    expect(v).toEqual([]);
  });

  it("fails when a plugin's table and its vocabulary declare different variables", () => {
    const v = checkThemeDirection(
      planted({
        vocabularies: {
          demo: {
            demoFill: { alias: 'dmf', kind: 'color', usedBy: ['demo'], nested: 'fill' },
            demoGap: { alias: 'dmx', kind: 'length', usedBy: [] },
          },
        },
      })
    );
    expect(v).toEqual([
      { rule: 'table-not-vocabulary', where: 'demo vars', name: 'demoFill' },
      { rule: 'table-not-vocabulary', where: 'demo vars', name: 'demoGap' },
    ]);
  });

  it("fails when core names a variable only a package's vocabulary declares", () => {
    const v = checkThemeDirection(
      planted({
        tables: {},
        vocabularies: { demo: { demoGap: { alias: 'dmx', kind: 'length', usedBy: [] } } },
        core: [file("const g = t.number('demoGap');", 'core.ts')],
      })
    );
    expect(v).toEqual([{ rule: 'core-names-diagram', where: 'core.ts', name: 'demoGap' }]);
  });

  it("lets a table's fallback name a family, and nothing else", () => {
    const v = checkThemeDirection(
      planted({
        diagrams: {
          demo: [
            file(
              "const t = { families: { neo: { fallback: 'redux' }, redux: { fallback: 'neo' } } };"
            ),
            file("const u = { fallback: 'redux-dark', other: 'neo' };", 'b.ts'),
          ],
        },
      })
    );
    expect(v.map((x) => x.name)).toEqual(['redux-dark', 'neo']);
  });

  it('lets a family through as const, satisfies, parentheses or a quoted families key', () => {
    const v = checkThemeDirection(
      planted({
        diagrams: {
          demo: [
            file(
              "const t = { families: { 'redux': { tokens: {} }, neo: { fallback: 'redux' as const } } };"
            ),
            file(
              "const t = { families: { neo: { fallback: ('neo' satisfies ThemeFamily) } } };",
              'b.ts'
            ),
            // Real theme names in the same places are still themes.
            file(
              "const t = { families: { 'redux-dark': {} }, x: { fallback: 'neo-dark' as const } };",
              'c.ts'
            ),
            file("const t = { other: { 'redux': {} } };", 'd.ts'),
          ],
        },
      })
    );
    expect(v.map((x) => x.name)).toEqual(['redux-dark', 'neo-dark', 'redux']);
  });
});
