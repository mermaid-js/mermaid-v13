/**
 * The 15 quadrant theme variables (#312, spec #289 §Integration) against v12 12.2.0's resolved
 * `getThemeVariables()`, in every built-in theme v12 has (D151: v12 is the oracle). Rules, not
 * literals, derive them (D232), so this also checks `adjust()` against khroma per theme. The one
 * difference is `quadrantPointFill` (D231): v12 resolved it to `hsl(…, NaN%)` and points showed
 * the root `textColor`, which is v13's default.
 */
import {
  THEME_NAMES,
  THEME_VARIABLES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type ThemeName,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { loadOracle } from '../oracle.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { themeVariables: Record<string, unknown> };
  };
}

await loadOracle();
const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

function v12Vars(theme: string, themeVariables: object = {}): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme, themeVariables });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

const QUADRANT = Object.keys(THEME_VARIABLES).filter((n) => n.startsWith('quadrant'));

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

describe('quadrant theme variables against v12 12.2.0', () => {
  it('are the 15 v12 names, read by the quadrant package only', () => {
    expect(QUADRANT).toHaveLength(15);
    for (const n of QUADRANT) {
      expect(THEME_VARIABLES[n]!.kind, n).toBe('color');
      expect(THEME_VARIABLES[n]!.usedBy, n).toEqual(['quadrant']);
    }
  });

  /**
   * The borders are `primaryBorderColor`, as for every other type (R-THEME-11). Core derives it
   * with its own rules, so where v12's khroma value differs the border does too: v12 → v13, as
   * MIGRATION.md lists them. Every other theme keeps v12's border.
   */
  const BORDER_CHANGES: Readonly<Record<string, readonly [string, string]>> = {
    default: ['#c7c7f1', '#c9c9d9'],
    dark: ['#cccccc', '#4c4d4d'],
    forest: ['#abb594', '#aec281'],
    neutral: ['#d4d4d4', '#cacaca'],
    base: ['#eeddbb', '#d9cfbc'],
    redux: ['#171717', '#28253d'],
    'redux-color': ['#171717', '#28253d'],
  };

  it.each(THEME_NAMES)('derive as v12 does in %s', async (name) => {
    const old = v12Vars(name);
    const theme = createTheme(await loadTheme(name), { cssVariables: false });
    const BORDERS = ['quadrantInternalBorderStrokeFill', 'quadrantExternalBorderStrokeFill'];
    const change = BORDER_CHANGES[name];
    for (const n of BORDERS) {
      expect(theme.value(n), n).toBe(theme.value('primaryBorderColor'));
      expect([hex(old[n]), hex(theme.value(n))], n).toEqual(change ?? [hex(old[n]), hex(old[n])]);
    }
    const differs = QUADRANT.filter((n) => !BORDERS.includes(n)).filter(
      (n) => hex(old[n]) !== hex(theme.value(n))
    );
    expect(differs).toEqual(['quadrantPointFill']);
    // D231: v12's precedence bug left the point fill unusable; points showed the root text colour.
    expect(String(old.quadrantPointFill)).toMatch(/NaN/);
    expect(theme.value('quadrantPointFill')).toBe(theme.value('textColor'));
  });

  it('list a border change only where v12 and v13 differ', () => {
    for (const [name, [was, now]] of Object.entries(BORDER_CHANGES))
      expect(was, name).not.toBe(now);
  });

  const FILLS = ['quadrant1Fill', 'quadrant2Fill', 'quadrant3Fill', 'quadrant4Fill'];
  const userPrimary = async (name: ThemeName): Promise<Record<string, unknown>[]> => {
    const vars = { primaryColor: '#336699' };
    const theme = createTheme(await loadTheme(name), { cssVariables: false, themeVariables: vars });
    const old = v12Vars(name, vars);
    return [
      ...FILLS.map((n) => ({ [n]: hex(old[n]) })),
      ...FILLS.map((n) => ({ [n]: hex(theme.value(n)) })),
    ];
  };

  it.each(['dark', 'forest', 'neutral', 'base', 'redux', 'redux-dark', 'neo', 'neo-dark'] as const)(
    'follow a user primaryColor in %s as v12 does (#ececfe pinned in redux and neo, D232)',
    async (name) => {
      const both = await userPrimary(name);
      expect(both.slice(4)).toEqual(both.slice(0, 4));
    }
  );

  it('follow a user primaryColor in default, where v12 kept its own (MIGRATION)', async () => {
    const both = await userPrimary('default');
    // v12 theme-default.js derives them once in its constructor, before the overrides arrive.
    expect(both[0]).toEqual({ quadrant1Fill: '#ececff' });
    expect(both[4]).toEqual({ quadrant1Fill: '#336699' });
  });

  it('follow a user primaryTextColor and primaryBorderColor in default, where v12 did not', async () => {
    const vars = { primaryTextColor: '#112233', primaryBorderColor: '#445566' };
    const old = v12Vars('default', vars);
    const theme = createTheme(await loadTheme('default'), {
      cssVariables: false,
      themeVariables: vars,
    });
    for (const n of ['quadrant1TextFill', 'quadrantTitleFill', 'quadrantPointTextFill']) {
      expect(hex(old[n]), n).toBe('#131300');
      expect(theme.value(n), n).toBe('#112233');
    }
    expect(hex(old.quadrantExternalBorderStrokeFill)).toBe('#c7c7f1');
    expect(theme.value('quadrantExternalBorderStrokeFill')).toBe('#445566');
  });

  // Core behaviour, listed in MIGRATION.md and left to core: v12's redux, redux-color, base and
  // neo switch the text colours to #eee under `darkMode: true`; v13's specs do not.
  it.each(['redux', 'redux-color', 'base', 'neo'] as const)(
    'keep the text colour under darkMode in %s, where v12 switched to #eee',
    async (name) => {
      const vars = { darkMode: true };
      const old = v12Vars(name, vars);
      const theme = createTheme(await loadTheme(name), {
        cssVariables: false,
        themeVariables: vars,
      });
      expect(hex(old.primaryTextColor)).toBe('#eeeeee');
      expect(hex(old.quadrantTitleFill)).toBe('#eeeeee');
      expect(hex(theme.value('quadrantTitleFill'))).not.toBe('#eeeeee');
    }
  );

  it('honour a user quadrantPointFill (D231)', async () => {
    const theme = createTheme(await loadTheme('default'), {
      cssVariables: false,
      themeVariables: { quadrantPointFill: '#0149ff' },
    });
    expect(theme.value('quadrantPointFill')).toBe('#0149ff');
  });
});
