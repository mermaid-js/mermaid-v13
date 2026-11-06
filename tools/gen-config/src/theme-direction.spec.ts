import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DiagramThemeTable } from '../../../packages/core/src/theme/diagram.ts';
import { THEME_NAMES, THEME_VARIABLES } from '../../../packages/core/src/theme/index.ts';
import { checkThemeDirection, packageGraph, type DirectionInput } from './theme-direction.ts';

/**
 * D331: dependencies between themes and diagrams run one way (spec #414). The check runs over the
 * repository, and each rule fails on a planted violation.
 */
const PACKAGES = fileURLToPath(new URL('../../../packages', import.meta.url));
const DIAGRAMS = readdirSync(PACKAGES).filter((d) => d.startsWith('diagram-'));

/** Each diagram package's `DiagramPlugin.theme`, from the plugins its entry exports. */
async function tables(): Promise<Record<string, DiagramThemeTable>> {
  const out: Record<string, DiagramThemeTable> = {};
  for (const dir of DIAGRAMS) {
    const mod = (await import(join(PACKAGES, dir, 'src/index.ts'))) as Record<string, unknown>;
    for (const v of Object.values(mod)) {
      if (typeof v !== 'object' || v === null) continue;
      const p = v as { id?: unknown; render?: unknown; theme?: DiagramThemeTable };
      if (typeof p.render === 'function' && typeof p.id === 'string' && p.theme)
        out[p.id] = p.theme;
    }
  }
  return out;
}

const repo: DirectionInput = {
  tables: await tables(),
  shared: new Set(Object.keys(THEME_VARIABLES)),
  themes: THEME_NAMES,
  core: [...packageGraph(join(PACKAGES, 'core')), ...packageGraph(join(PACKAGES, 'mermaid'))],
  diagrams: Object.fromEntries(
    DIAGRAMS.map((d) => [d.slice('diagram-'.length), packageGraph(join(PACKAGES, d))])
  ),
};

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
      { rule: 'table-reads-foreign', where: 'other entries', name: 'mainBkg' },
    ]);
  });

  it("fails when a table's name is core's or another table's", () => {
    const dup: DiagramThemeTable = {
      vars: { demoFill: { alias: 'x', kind: 'color' }, mainBkg: { alias: 'y', kind: 'color' } },
      rules: { light: {} },
    };
    const v = checkThemeDirection(planted({ tables: { demo: TABLE, dup } }));
    expect(v.map((x) => x.name).sort()).toEqual(['demoFill', 'mainBkg']);
  });
});
