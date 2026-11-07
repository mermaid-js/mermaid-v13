/**
 * #462: packet's ten theme variables (the plugin's own table, D331, D335, D540) against what
 * v12 12.2.0 draws, in all eleven themes (D151: v12 is the oracle). "What v12 draws" is the CSS
 * v12's own packet `styles()` writes for a theme's resolved `themeVariables`
 * (`styles.ts:18-44`: `cleanAndMerge(defaultPacketStyleOptions, themeVariables.packet)`), read
 * back property by property. Only `dark` and `forest` give packet a block (`updateColors`), so
 * the other nine draw `styles.ts`'s literals. Colours compare as hex, lengths as px numbers.
 *
 * Every pair that differs is in `DIFFERENCES` with the decision that makes it, and the list has
 * to match the differences found exactly, so none is unlisted and none is stale:
 * - D333(b): `neo-dark`, `redux-dark` and `redux-dark-color` take the dark entry (the theme's
 *   own `primaryTextColor` inks on its `background`), where v12 drew black on `#efefef` on a
 *   dark page;
 * - D541: `forest` takes the light entry (black on `#efefef`), as no trait separates it from
 *   `default`, where v12 forest read its own `primaryTextColor` and `mainBkg`.
 */
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packet } from '@mermaid-js/diagram-packet';
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

/** v12's packet diagram module (the chunk holding `src/diagrams/packet/styles.ts`). */
async function v12PacketStyles(): Promise<(options: object) => string> {
  const pkg = realpathSync(
    dirname(createRequire(import.meta.url).resolve('mermaid-v12/package.json'))
  );
  const dir = join(pkg, 'dist', 'chunks', 'mermaid.core');
  const file = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .find((f) => readFileSync(join(dir, f), 'utf8').includes('// src/diagrams/packet/styles.ts'));
  if (!file) throw new Error('v12 packet chunk not found');
  const mod = (await import(pathToFileURL(join(dir, file)).href)) as {
    diagram: { styles: (options: object) => string };
  };
  return mod.diagram.styles;
}
const styles = await v12PacketStyles();

function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  return { ...v12.mermaidAPI.getConfig().themeVariables };
}

/** v12's style key → the selector and property its CSS writes it to (`styles.ts:21-43`). */
const CSS: Readonly<Record<string, readonly [selector: string, property: string]>> = {
  byteFontSize: ['.packetByte', 'font-size'],
  startByteColor: ['.packetByte.start', 'fill'],
  endByteColor: ['.packetByte.end', 'fill'],
  labelColor: ['.packetLabel', 'fill'],
  labelFontSize: ['.packetLabel', 'font-size'],
  titleColor: ['.packetTitle', 'fill'],
  titleFontSize: ['.packetTitle', 'font-size'],
  blockStrokeColor: ['.packetBlock', 'stroke'],
  blockStrokeWidth: ['.packetBlock', 'stroke-width'],
  blockFillColor: ['.packetBlock', 'fill'],
};

type Drawn = Record<string, string>;

/** What v12 draws in `theme`: its packet CSS for that theme's variables, key by key. */
function v12Drawn(theme: string, themeVariables?: object): Drawn {
  const css = styles(v12Vars(theme, themeVariables));
  const rules = new Map<string, Record<string, string>>();
  for (const [, selector, body] of css.matchAll(/([.\w]+)\s*\{([^}]*)\}/g)) {
    const decls: Record<string, string> = {};
    for (const decl of body!.split(';')) {
      const at = decl.indexOf(':');
      if (at > 0) decls[decl.slice(0, at).trim()] = decl.slice(at + 1).trim();
    }
    rules.set(selector!, decls);
  }
  return Object.fromEntries(
    Object.entries(CSS).map(([key, [sel, prop]]) => [key, rules.get(sel)?.[prop] ?? ''])
  );
}

const VARS = packet.theme.vars;
/** Flat v13 name → v12's key in the `packet` block (the table's `nested`). */
const NESTED = Object.fromEntries(Object.entries(VARS).map(([flat, v]) => [flat, v.nested!]));
const NAMES = Object.keys(VARS);
const isColour = (name: string): boolean => VARS[name]?.kind === 'color';
const COLOURS = NAMES.filter(isColour);
const LENGTHS = NAMES.filter((n) => !isColour(n));

const hex = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const rgba = parseColor(v);
  return rgba ? formatColor(rgba) : undefined;
};

/** v13's value of a flat variable in v12's terms: hex for a colour, px number for a length. */
function v13Value(t: Theme, name: string): string | number | undefined {
  return isColour(name) ? hex(t.value(name)) : t.number(name);
}

/** The same for what v12 drew: the value of the variable's nested key in a {@link v12Drawn}. */
function v12Value(drawn: Drawn, name: string): string | number | undefined {
  const v = drawn[NESTED[name]!];
  return isColour(name) ? hex(v) : Number.parseFloat(String(v));
}

async function v13Theme(
  name: string,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> {
  return createTheme(await loadTheme(name as ThemeName), {
    diagram: packet.theme,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

const D333B_DARK =
  'D333(b): the dark entry, the theme’s own primaryTextColor inks on its background, as dark; v12 drew black on #efefef';
const D541_FOREST =
  'D541: forest takes the light entry (black on #efefef), as no trait separates it from default; v12 forest read its primaryTextColor and mainBkg';

const listed = (theme: string, names: readonly string[], why: string): [string, string][] =>
  names.map((n) => [`${theme}/${n}`, why]);

/** `theme/variable` → the decision that makes v13 draw it differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = Object.fromEntries([
  ...listed('forest', COLOURS, D541_FOREST),
  ...['neo-dark', 'redux-dark', 'redux-dark-color'].flatMap((t) => listed(t, COLOURS, D333B_DARK)),
]);

/** The themes v12 gives a packet block (`updateColors` in `theme-dark.js`, `theme-forest.js`). */
const V12_BLOCK = ['dark', 'forest'];
const DARK_THEMES = ['dark', 'neo-dark', 'redux-dark', 'redux-dark-color'];

describe('packet theme variables against v12 12.2.0 (#462, D333(b), D541)', () => {
  it('covers v12’s whole packet style block: six colours, four lengths', () => {
    expect(NAMES).toHaveLength(10);
    expect(Object.values(NESTED).sort()).toEqual(Object.keys(CSS).sort());
    expect(COLOURS).toHaveLength(6);
  });

  it('reads v12’s literals where a theme has no packet block', () => {
    expect(v12Drawn('default')).toEqual({
      byteFontSize: '10px',
      startByteColor: 'black',
      endByteColor: 'black',
      labelColor: 'black',
      labelFontSize: '12px',
      titleColor: 'black',
      titleFontSize: '14px',
      blockStrokeColor: 'black',
      blockStrokeWidth: '1',
      blockFillColor: '#efefef',
    });
  });

  it('differs from what v12 draws only where a decision says so', async () => {
    const found: string[] = [];
    for (const name of THEME_NAMES) {
      const old = v12Drawn(name);
      const theme = await v13Theme(name);
      for (const n of NAMES)
        if (v13Value(theme, n) !== v12Value(old, n)) found.push(`${name}/${n}`);
    }
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('v12 gives only dark and forest a packet block', () => {
    for (const name of THEME_NAMES)
      expect(v12Vars(name).packet !== undefined, name).toBe(V12_BLOCK.includes(name));
  });

  it.each(DARK_THEMES.map((n) => [n]))(
    '%s: inks are the theme’s primaryTextColor, the fill its background (the dark entry)',
    async (name) => {
      const theme = await v13Theme(name);
      const own = v12Vars(name);
      for (const n of COLOURS) {
        const from = n === 'packetBlockFillColor' ? 'background' : 'primaryTextColor';
        expect(v13Value(theme, n), `${name}/${n}`).toBe(hex(own[from]));
      }
    }
  );

  it('forest: black on #efefef, default’s (the light entry, D541)', async () => {
    const forest = await v13Theme('forest');
    const old = v12Drawn('default');
    for (const n of COLOURS) expect(v13Value(forest, n), n).toBe(v12Value(old, n));
  });

  it('the four lengths are v12’s in every theme', async () => {
    for (const name of THEME_NAMES) {
      const theme = await v13Theme(name);
      expect(
        LENGTHS.map((n) => v13Value(theme, n)),
        name
      ).toEqual(LENGTHS.map((n) => v12Value(v12Drawn(name), n)));
    }
  });

  // v12 merges an author's `themeVariables` over the theme's own (`applyOverride`, key by key in
  // a nested object), so a nested value wins in every theme and the other keys keep the theme's.
  const NESTED_OVERRIDE = {
    packet: {
      labelColor: '#123456',
      blockFillColor: '#abcdef',
      startByteColor: '#ff0000',
      titleFontSize: '20px',
      blockStrokeWidth: '3',
    },
  };
  const OVERRIDDEN = NAMES.filter((n) => NESTED[n]! in NESTED_OVERRIDE.packet);

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: a nested themeVariables.packet value wins, as in v12 (D335, D540)',
    async (name) => {
      const old = v12Drawn(name, NESTED_OVERRIDE);
      const theme = await v13Theme(name, NESTED_OVERRIDE);
      expect(OVERRIDDEN).toHaveLength(5);
      expect(Object.fromEntries(OVERRIDDEN.map((n) => [n, v13Value(theme, n)]))).toEqual(
        Object.fromEntries(OVERRIDDEN.map((n) => [n, v12Value(old, n)]))
      );
    }
  );

  it('dark: a nested value leaves the other keys on the theme’s block, as in v12', async () => {
    const vars = { packet: { labelColor: '#123456' } };
    const old = v12Drawn('dark', vars);
    const theme = await v13Theme('dark', vars);
    expect(Object.fromEntries(NAMES.map((n) => [n, v13Value(theme, n)]))).toEqual(
      Object.fromEntries(NAMES.map((n) => [n, v12Value(old, n)]))
    );
  });

  it.each(THEME_NAMES.map((n) => [n]))(
    '%s: the flat name wins over the nested key when both are set (D540)',
    async (name) => {
      const theme = await v13Theme(name, {
        packetLabelColor: '#654321',
        packetTitleFontSize: 30,
        packet: { labelColor: '#123456', titleFontSize: '20px', endByteColor: '#fedcba' },
      });
      expect(v13Value(theme, 'packetLabelColor')).toBe('#654321');
      expect(v13Value(theme, 'packetTitleFontSize')).toBe(30);
      expect(v13Value(theme, 'packetEndByteColor')).toBe('#fedcba');
    }
  );

  it('dark: a primaryTextColor override moves the inks, as in v12', async () => {
    const vars = { primaryTextColor: '#1d3557' };
    const old = v12Drawn('dark', vars);
    const theme = await v13Theme('dark', vars);
    expect(v12Value(old, 'packetLabelColor')).toBe('#1d3557');
    for (const n of COLOURS) expect(v13Value(theme, n), n).toBe(v12Value(old, n));
  });

  it('forest: a primaryTextColor override moves v12’s inks, not v13’s (D541)', async () => {
    const vars = { primaryTextColor: '#1d3557' };
    expect(v12Value(v12Drawn('forest', vars), 'packetLabelColor')).toBe('#1d3557');
    expect(v13Value(await v13Theme('forest', vars), 'packetLabelColor')).toBe('#000000');
  });
});
