/**
 * Kanban's column colours against what v12 12.2.0 computes, in all eleven themes (D151: v12 is
 * the oracle; D374, D741). v12 colours a column with its diagram style sheet
 * (`kanban/styles.ts`): `genSections` fills `.section-<n-1>` with `adjuster(cScale<n>, 10)`,
 * khroma's `lighten`, or its `darken` when the options say `darkMode`. This calls that very
 * function, `diagram.styles` of 12.2.0's kanban chunk, with the options v12's `mermaidAPI` gives
 * it, and reads each slot's fill. v13 resolves `kanbanColumn<n>` through the plugin's table
 * (`theme/table.ts`). Colours compare as hex.
 *
 * Every value that differs is in `DIFFERENCES` with the decision that makes it, and the list
 * has to match the differences found exactly: none unlisted, none stale.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETTE_LIMIT, THEME_NAMES, createTheme, loadTheme } from '@mermaid-js/core/theme';
import type { ThemeName } from '@mermaid-js/core/theme';
import { kanban } from '@mermaid-js/diagram-kanban';
import { hex } from '../hex.ts';

interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { theme?: string; themeVariables: Record<string, unknown> };
  };
}

// The core build and its kanban chunk, both by file URL, so they share one config module.
const entry = createRequire(import.meta.url).resolve('mermaid-v12');
const v12 = ((await import(pathToFileURL(entry).href)) as { default: V12 }).default;
const chunks = join(dirname(entry), 'chunks/mermaid.core');
const chunk = readdirSync(chunks).find((f) => /^kanban-definition-\w+\.mjs$/.test(f))!;
const { diagram } = (await import(pathToFileURL(join(chunks, chunk)).href)) as {
  diagram: { styles: (options: Record<string, unknown>) => string };
};

const SLOTS = Array.from({ length: PALETTE_LIMIT }, (_, n) => n);

/** v12's column fill of each `cScale` slot under `theme`, read from `.section-<n-1> rect`. */
function v12Columns(theme: string, themeVariables?: object): (string | undefined)[] {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  const css = diagram.styles({ ...v12.mermaidAPI.getConfig().themeVariables });
  v12.mermaidAPI.reset();
  return SLOTS.map((n) => {
    const at = css.indexOf(`.section-${n - 1} rect`);
    const fill = /fill:\s*([^;]+);/.exec(css.slice(at))?.[1];
    return hex(fill?.trim());
  });
}

/** v13's `kanbanColumn<n>` of each slot under `theme`. */
async function v13Columns(theme: string, themeVariables?: Record<string, unknown>) {
  const t = createTheme(await loadTheme(theme as ThemeName), {
    diagram: kanban.theme,
    cssVariables: false,
    ...(themeVariables ? { themeVariables } : {}),
  });
  return SLOTS.map((n) => hex(t.value(`kanbanColumn${n}`)));
}

/** The largest difference of one RGB channel between two hex colours. */
function channelGap(a: string | undefined, b: string | undefined): number {
  const rgb = (c = '') => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]!)));
}

const D374_DARK =
  'D374: columns darken under the dark trait; v12 never set darkMode in this theme and lightened';

/** Theme → the decision that makes v13 colour its columns differently from v12. */
const DIFFERENCES: Readonly<Record<string, string>> = {
  'neo-dark': D374_DARK,
  'redux-dark': D374_DARK,
  'redux-dark-color': D374_DARK,
};

describe('kanban column colours against v12 12.2.0 (D374, D741)', () => {
  it('differs from what v12 computes only where DIFFERENCES says so, in all eleven themes', async () => {
    const found: string[] = [];
    for (const name of THEME_NAMES) {
      const old = v12Columns(name);
      expect(old.every(Boolean), name).toBe(true);
      if (JSON.stringify(await v13Columns(name)) !== JSON.stringify(old)) found.push(name);
    }
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });

  it('lightens every column under theme: dark, as v12 does (D741)', async () => {
    expect(await v13Columns('dark')).toEqual(v12Columns('dark'));
  });

  it('darkens under an author’s darkMode on a light theme, as v12 does', async () => {
    const author = { darkMode: true };
    const now = await v13Columns('default', author);
    const old = v12Columns('default', author);
    expect(now).not.toEqual(await v13Columns('default'));
    // khroma rounds some darkened channels one step up (#a953ff where v13 gives #a853ff).
    for (const n of SLOTS) expect(channelGap(now[n], old[n]), `slot ${n}`).toBeLessThanOrEqual(1);
  });

  it('lightens under theme: dark with darkMode, where v12 darkens (D741, a listed divergence)', async () => {
    const author = { darkMode: true };
    expect(await v13Columns('dark', author)).toEqual(await v13Columns('dark'));
    expect(await v13Columns('dark', author)).not.toEqual(v12Columns('dark', author));
  });
});
