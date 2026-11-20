/**
 * Usecase's colours against what v12 12.2.0 computes, in all eleven themes (spec #517 T4, D151:
 * v12 is the oracle; D474, D541). v12 colours usecase with its diagram style sheet
 * (`usecase/styles.ts`): `roleColors` over the theme's variables for the eight role colours, and
 * `[data-color-id]` rules for the palette slots. This calls that very function, `diagram.styles`
 * of 12.2.0's usecase chunk, with the options v12's `mermaidAPI` gives it (`themeVariables`,
 * `theme`, `look`), and reads each colour from the rule that paints it. v13 resolves the same
 * through the plugin's table (`theme/table.ts`) and the renderer's slots (`render/paint.ts`).
 * Colours compare as hex.
 *
 * Every value that differs is in `DIFFERENCES` with the decision that makes it, and the list
 * has to match the differences found exactly: none unlisted, none stale.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_NAMES, createTheme, loadTheme, type ThemeName } from '@mermaid-js/core/theme';
import { usecase } from '@mermaid-js/diagram-usecase';
import { usecasePaletteSlots } from '@mermaid-js/diagram-usecase/testing';
import { hex } from '../hex.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): {
      theme?: string;
      look?: string;
      themeVariables: Record<string, unknown>;
    };
  };
}

// The core build and its usecase chunk, both by file URL, so they share one config module.
const entry = createRequire(import.meta.url).resolve('mermaid-v12');
const v12 = ((await import(pathToFileURL(entry).href)) as { default: V12 }).default;
const chunks = join(dirname(entry), 'chunks/mermaid.core');
const chunk = readdirSync(chunks).find((f) => /^usecaseDiagram-\w+\.mjs$/.test(f))!;
const { diagram } = (await import(pathToFileURL(join(chunks, chunk)).href)) as {
  diagram: { styles: (options: Record<string, unknown>) => string };
};

/** v12's style sheet for usecase under `theme` (and `config`), as `mermaidAPI` builds it. */
function v12Css(
  theme: string,
  config: object = {}
): { css: string; vars: Record<string, unknown> } {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize({ theme, ...config });
  const c = v12.mermaidAPI.getConfig();
  const vars = { ...c.themeVariables };
  return { css: diagram.styles({ ...vars, theme: c.theme, look: c.look }), vars };
}

/** The declarations of the first rule whose selector list starts with `selector`. */
function rule(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no rule ${selector}`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out: Record<string, string> = {};
  for (const d of body.split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out;
}

/** The eight role colours v12 paints (`roleColors`, read back from the rules that use them). */
function v12Roles(css: string): Record<string, string | undefined> {
  const actor = rule(css, '& .usecase-actor-shape,');
  const body = rule(css, '& .usecase-element ellipse,');
  const boundary = rule(css, '& .system-boundary rect.boundary-body,');
  return {
    usecaseActorBkg: hex(actor.fill),
    usecaseActorBorder: hex(actor.stroke),
    usecaseBkg: hex(body.fill),
    usecaseBorder: hex(body.stroke),
    usecaseBoundaryBkg: hex(boundary.fill),
    usecaseBoundaryBorder: hex(boundary.stroke),
    usecaseIncludeLine: hex(rule(css, '& .relationship-include {').stroke),
    usecaseExtendLine: hex(rule(css, '& .relationship-extend {').stroke),
    // The actor's name: `actorTextColor ?? primaryTextColor`.
    actorText: hex(rule(css, '& .usecase-actor .nodeLabel,').fill),
  };
}

const ROLES = [
  'usecaseActorBkg',
  'usecaseActorBorder',
  'usecaseBkg',
  'usecaseBorder',
  'usecaseBoundaryBkg',
  'usecaseBoundaryBorder',
  'usecaseIncludeLine',
  'usecaseExtendLine',
] as const;

async function v13Theme(name: string, themeVariables?: Readonly<Record<string, unknown>>) {
  return createTheme(await loadTheme(name as ThemeName), {
    diagram: usecase.theme,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

/** What v13 paints for the same, read as v12's above. */
async function v13Roles(
  name: string,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Record<string, string | undefined>> {
  const theme = await v13Theme(name, themeVariables);
  const out: Record<string, string | undefined> = {};
  for (const r of ROLES) out[r] = hex(theme.value(r));
  // v13 draws actor names in `primaryTextColor` (`actorTextColor` is sequence's row).
  out.actorText = hex(theme.value('primaryTextColor'));
  return out;
}

const D474_GREYS =
  'D474, D541: redux-color’s boundary fill #FAFAFC is no palette slot and no trait separates the theme from redux, so the table keeps v12’s fallback clusterBkg (#F9F9FB); the theme never paints it (each boundary takes its palette slot). Its border and redux-dark-color’s equal clusterBorder';
const ACTOR_TEXT =
  'actor names in primaryTextColor: v12’s actorTextColor is sequence’s row (a row two types read belongs in core); for the maintainer';

const BASE_BORDER =
  'core: the fallback (actorBorder, nodeBorder, clusterBorder) is v13 base’s border step, which v12 derived with a saturation change the derivation DSL has none of (MIGRATION “base”)';
const NEO_DARK_CLUSTER =
  'core, D183: the fallback clusterBorder is derived with the dark rules in neo-dark; v12 never set darkMode';

/** `theme/key` → the decision that makes v13 draw it differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = {
  'base/usecaseActorBorder': BASE_BORDER,
  'base/usecaseBorder': BASE_BORDER,
  'base/usecaseBoundaryBorder': BASE_BORDER,
  'neo-dark/usecaseBoundaryBorder': NEO_DARK_CLUSTER,
  'redux-color/usecaseBoundaryBkg': D474_GREYS,
  'default/actorText': ACTOR_TEXT,
  'dark/actorText': ACTOR_TEXT,
  'forest/actorText': ACTOR_TEXT,
  'neutral/actorText': ACTOR_TEXT,
};

describe('usecase role colours against v12 12.2.0 (spec #517 T4, D474)', () => {
  it('differs from what v12 computes only where DIFFERENCES says so, in all eleven themes', async () => {
    const found: string[] = [];
    const detail: string[] = [];
    for (const name of THEME_NAMES) {
      const old = v12Roles(v12Css(name).css);
      const now = await v13Roles(name);
      for (const key of Object.keys(old)) {
        expect(old[key], `${name}/${key}`).toBeDefined();
        if (now[key] === old[key]) continue;
        found.push(`${name}/${key}`);
        if (!(`${name}/${key}` in DIFFERENCES))
          detail.push(`${name}/${key}: ${now[key]} vs ${old[key]}`);
      }
    }
    expect(detail).toEqual([]);
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('reads redux-color’s six hued values from its palettes, and redux-dark-color’s borders and lines', async () => {
    const { vars } = v12Css('redux-color');
    const border = (vars.borderColorArray as string[]).map(hex);
    const bkg = (vars.bkgColorArray as string[]).map(hex);
    expect(await v13Roles('redux-color')).toMatchObject({
      usecaseActorBorder: border[5],
      usecaseActorBkg: bkg[5],
      usecaseBorder: border[1],
      usecaseBkg: bkg[1],
      usecaseIncludeLine: border[10],
      usecaseExtendLine: border[2],
    });
    const dark = await v13Roles('redux-dark-color');
    const theme = await v13Theme('redux-dark-color');
    expect(theme.palette('bkgColorArray')).toEqual([]);
    expect(dark.usecaseActorBkg).toBe(hex(theme.value('actorBkg')));
    expect(dark.usecaseBkg).toBe(hex(theme.value('mainBkg')));
  });

  it('lets an author’s role colour win, as in v12', async () => {
    for (const name of ['default', 'redux-color', 'neo-dark']) {
      const author = { usecaseActorBkg: '#123456', usecaseIncludeLine: '#654321' };
      const old = v12Roles(v12Css(name, { themeVariables: author }).css);
      const now = await v13Roles(name, author);
      expect([now.usecaseActorBkg, now.usecaseIncludeLine], name).toEqual(['#123456', '#654321']);
      expect([old.usecaseActorBkg, old.usecaseIncludeLine], name).toEqual(['#123456', '#654321']);
    }
  });

  it('follows an author’s palette in any theme, where v12 kept the theme’s (D474)', async () => {
    const author = { borderColorArray: ['#ff0000', '#00ff00'], bkgColorArray: ['#ffeeee'] };
    const now = await v13Roles('default', author);
    // Slot 5 is past a two-colour palette's end: `currentColor` (the contract's rule).
    expect(now.usecaseBorder).toBe('#00ff00');
    expect(now.usecaseBkg).toBeUndefined();
    const old = v12Roles(v12Css('default', { themeVariables: author }).css);
    expect(old.usecaseBorder).toBe(hex(v12Css('default').vars.nodeBorder));
  });
});

/** v12's slot rules: slot → its border and fill, for a selector after the slot. */
function v12Slots(css: string, after: string): Map<number, { stroke?: string; fill?: string }> {
  const out = new Map<number, { stroke?: string; fill?: string }>();
  const re = new RegExp(
    `\\[data-color-id="color-(\\d+)"\\]${after.replace(/[.[\]]/g, '\\$&')}`,
    'g'
  );
  for (const m of css.matchAll(re)) {
    const slot = Number(m[1]);
    if (out.has(slot)) continue;
    const d = rule(css.slice(m.index), m[0]);
    out.set(slot, { stroke: hex(d.stroke), fill: hex(d.fill) });
  }
  return out;
}

describe('usecase palette slots against v12 12.2.0 (theming.md, v12 styles.ts:75-187)', () => {
  it.each([['redux-color'], ['redux-dark-color']])(
    '%s: each boundary takes its slot under role and rotate; actors and use cases only under rotate',
    async (name) => {
      const theme = await v13Theme(name);
      const slots = usecasePaletteSlots(theme);
      const n = theme.palette('borderColorArray').length;
      expect(n).toBe(12);
      const now = (i: number) => {
        const s = slots(i)!;
        return { stroke: hex(s.stroke), fill: hex(s.fill) };
      };
      for (const scheme of ['role', 'rotate'] as const) {
        const { css } = v12Css(name, { usecase: { colorScheme: scheme } });
        const boundaries = v12Slots(css, '.system-boundary rect.boundary-body');
        expect(boundaries.size, scheme).toBe(n);
        const actors = v12Slots(css, '.usecase-actor .usecase-actor-shape');
        const bodies = v12Slots(css, '.usecase-element ellipse');
        expect([actors.size, bodies.size], scheme).toEqual(scheme === 'rotate' ? [n, n] : [0, 0]);
        for (let i = 0; i < n; i++) {
          // Where v12's slot rule sets no fill (an empty bkgColorArray), the role fill stays.
          expect(now(i), `${scheme} ${i}`).toEqual(boundaries.get(i));
          if (scheme === 'rotate') {
            expect(now(i), `${scheme} actor ${i}`).toEqual(actors.get(i));
            expect(now(i), `${scheme} use case ${i}`).toEqual(bodies.get(i));
          }
        }
        // The slot wraps at the palette's length, as v12's `colorIndex % length`.
        expect(slots(n + 1)!.id).toBe('color-1');
      }
    }
  );

  it('stamps no slot without a palette, as v12 in the nine other themes', async () => {
    for (const name of THEME_NAMES.filter((t) => !t.endsWith('-color'))) {
      expect(usecasePaletteSlots(await v13Theme(name))(0), name).toBeUndefined();
      expect(v12Slots(v12Css(name).css, '.system-boundary rect.boundary-body').size, name).toBe(0);
    }
  });
});
