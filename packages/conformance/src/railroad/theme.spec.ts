/**
 * #613: the eleven railroad theme variables (the plugin's own table, D331, D335, D516, D540)
 * against what v12 12.2.0 draws, in all eleven themes (D151: v12 is the oracle). v12 coloured
 * railroad from one style sheet, `getStyles(themeVariables)` (`styles.ts`), whose colours come
 * from `buildThemeDefaults` over theme-default's variables with the theme's resolved
 * `themeVariables` spread on top; the oracle's own `getStyles` gives that sheet, and each
 * variable is read from the CSS rule that draws it. Colours compare as hex.
 *
 * A railroad variable whose v12 value is its shared variable's (`SHARED`) and whose v13 value is
 * v13's value of that same shared variable is no railroad difference: core resolves the shared
 * variable (its own decisions and oracle specs), and railroad follows it as v12 did. Every
 * other pair that differs is in `DIFFERENCES` with the decision that makes it, and the list has
 * to match the differences found exactly, so none is unlisted and none is stale. It is empty:
 * the terminal fill, v12's `secondBkg` over theme-default's variables (`#ffffde` in base, neo,
 * redux and redux-color), is 12.2.0's in all eleven themes.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { railroad } from '@mermaid-js/diagram-railroad';
import {
  THEME_NAMES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type Theme,
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
/** v12's railroad styles (`styles.ts` `getStyles`), from the chunk the oracle's mermaid loads. */
const chunks = join(
  dirname(createRequire(import.meta.url).resolve('mermaid-v12/package.json')),
  'dist/chunks/mermaid.core'
);
const { getStyles } = (await import(pathToFileURL(join(chunks, 'chunk-2E7WHVMD.mjs')).href)) as {
  getStyles: (options: object) => string;
};

/** The CSS rule (selector, property) each variable is drawn by in v12. */
const DRAWN_BY: Readonly<Record<string, readonly [string, string]>> = {
  railroadTerminalFill: ['.railroad-terminal rect', 'fill'],
  railroadTerminalStroke: ['.railroad-terminal rect', 'stroke'],
  railroadTerminalTextColor: ['.railroad-terminal text', 'fill'],
  railroadNonTerminalFill: ['.railroad-nonterminal rect', 'fill'],
  railroadNonTerminalStroke: ['.railroad-nonterminal rect', 'stroke'],
  railroadNonTerminalTextColor: ['.railroad-nonterminal text', 'fill'],
  railroadLineColor: ['.railroad-line', 'stroke'],
  railroadMarkerFill: ['.railroad-start circle,\n  .railroad-end circle', 'fill'],
  railroadSpecialFill: ['.railroad-special rect', 'fill'],
  railroadSpecialStroke: ['.railroad-special rect', 'stroke'],
  railroadRuleNameColor: ['.railroad-rule-name', 'fill'],
};

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v.trim());
  return rgba ? formatColor(rgba) : undefined;
};

/**
 * The shared variable each railroad variable follows in v12 (`buildThemeDefaults`'s `a ?? b`,
 * read as `a`: every theme writes it) and in v13 (the table's light rule). The terminal fill,
 * v12's `secondBkg`, has no shared counterpart in core and is compared on its own.
 */
const SHARED: Readonly<Record<string, string>> = {
  railroadTerminalStroke: 'secondaryBorderColor',
  railroadTerminalTextColor: 'secondaryTextColor',
  railroadNonTerminalFill: 'mainBkg',
  railroadNonTerminalStroke: 'primaryBorderColor',
  railroadNonTerminalTextColor: 'primaryTextColor',
  railroadLineColor: 'lineColor',
  railroadMarkerFill: 'lineColor',
  railroadSpecialFill: 'tertiaryColor',
  railroadSpecialStroke: 'tertiaryBorderColor',
  railroadRuleNameColor: 'titleColor',
};

/** v12 12.2.0's resolved `themeVariables` for `theme`. */
function v12Vars(theme: string): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

/** What v12 12.2.0 draws for each variable in `theme`. */
function v12Drawn(theme: string): Record<string, string | undefined> {
  const css = getStyles(v12Vars(theme));
  const out: Record<string, string | undefined> = {};
  for (const [name, [selector, prop]] of Object.entries(DRAWN_BY)) {
    const at = css.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`v12 styles: no rule ${selector}`);
    const body = css.slice(at, css.indexOf('}', at));
    out[name] = hex(new RegExp(`\\s${prop}: ([^;]+);`).exec(body)?.[1]);
  }
  return out;
}

async function v13Theme(name: string): Promise<Theme> {
  return createTheme(await loadTheme(name as ThemeName), {
    diagram: railroad.theme,
    cssVariables: false,
  });
}

/** `theme/variable` → the decision that makes v13 draw it differently from v12 (none). */
const DIFFERENCES: Readonly<Record<string, string>> = {};

const NAMES = Object.keys(railroad.theme.vars);

describe('railroad theme variables against v12 12.2.0 (#613, D516, D541)', () => {
  it('covers every colour v12’s railroad styles draw', () => {
    expect(NAMES.sort()).toEqual(Object.keys(DRAWN_BY).sort());
  });

  it('differs from what v12 draws only where a decision says so', async () => {
    const found: string[] = [];
    for (const name of THEME_NAMES) {
      const old = v12Drawn(name);
      const theme = await v13Theme(name);
      const shared = v12Vars(name);
      for (const n of NAMES) {
        const now = hex(theme.value(n));
        if (now === old[n]) continue;
        // Core's own value of the shared variable differs from v12's: railroad follows it.
        const from = SHARED[n];
        if (from && old[n] === hex(shared[from]) && now === hex(theme.value(from))) continue;
        found.push(`${name}/${n} v13 ${now} v12 ${old[n]}`);
      }
    }
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('fills terminals as 12.2.0 in all eleven themes (v12’s secondBkg)', async () => {
    const fills: Record<string, string | undefined> = {};
    for (const name of THEME_NAMES) {
      expect(hex((await v13Theme(name)).value('railroadTerminalFill')), name).toBe(
        v12Drawn(name).railroadTerminalFill
      );
      fills[name] = v12Drawn(name).railroadTerminalFill;
    }
    for (const name of ['base', 'neo', 'redux', 'redux-color']) expect(fills[name]).toBe('#ffffde');
  });
});
