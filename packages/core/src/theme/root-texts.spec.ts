/**
 * `Theme.rootStyleText()` against the way it found its memo before: a key joined from the names
 * used, in the order they were first used, in one map per set of theme parts. That form is kept
 * here as the reference. Themes that share their parts (no `themeVariables`) read generated
 * sequences of names, interleaved, and each root text is compared with the reference's and with
 * the declarations built afresh.
 */
import { describe, expect, it } from 'vitest';
import { styleText } from '../svg/style.ts';
import type { StyleText } from '../svg/types.ts';
import { createTheme, loadTheme, THEME_NAMES, type Theme, type ThemeSpec } from './index.ts';

let seed = 7;
const pick = (n: number): number => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed >>> 8) % n;
};

// Names a flowchart reads, of every kind; `font` takes any name and marks it used.
const NAMES = [
  'fontFamily',
  'fontSize',
  'mainBkg',
  'nodeBorder',
  'nodeTextColor',
  'strokeWidth',
  'lineColor',
  'arrowheadColor',
  'dropShadow',
  'clusterBkg',
  'clusterBorder',
  'clusterStrokeWidth',
  'titleColor',
  'edgeLabelBackground',
  'textColor',
  'primaryColor',
];

/** The old memo: per set of parts, by `[...used].join(',')`. */
class OldRootTexts {
  private readonly byParts = new Map<string, Map<string, StyleText>>();
  text(parts: string, used: readonly string[], build: () => StyleText): StyleText {
    let texts = this.byParts.get(parts);
    if (!texts) this.byParts.set(parts, (texts = new Map<string, StyleText>()));
    const key = [...new Set(used)].join(',');
    let text = texts.get(key);
    if (text === undefined) texts.set(key, (text = build()));
    return text;
  }
}

function reads(): string[] {
  const out: string[] = [];
  for (let i = pick(12); i >= 0; i--) out.push(NAMES[pick(NAMES.length)]!);
  return out;
}

describe('the root text memo', () => {
  it('gives what the joined-key memo gave, over generated name sequences', async () => {
    const dark = await loadTheme('dark');
    const specs: [string, ThemeSpec, ThemeSpec | undefined][] = [];
    for (const name of THEME_NAMES) {
      specs.push([name, await loadTheme(name), undefined]);
      specs.push([`${name}+auto`, await loadTheme(name), dark]);
    }
    const old = new OldRootTexts();
    for (let i = 0; i < 4000; i++) {
      const [key, spec, night] = specs[pick(specs.length)]!;
      const theme: Theme = createTheme(spec, { dark: night });
      const used = reads();
      // Part of the names, a root text, then more names: a later root text reads them all.
      const cut = pick(used.length + 1);
      for (const n of used.slice(0, cut)) theme.font(n);
      if (pick(2)) {
        const early = used.slice(0, cut);
        expect(theme.rootStyleText()).toBe(
          old.text(key, early, () => styleText(theme.rootStyle()))
        );
      }
      for (const n of used.slice(cut)) theme.font(n);
      const text = theme.rootStyleText();
      expect(text).toBe(old.text(key, used, () => styleText(theme.rootStyle())));
      expect(text).toBe(styleText(theme.rootStyle()));
    }
  });

  it('builds afresh for a theme with its own variables, as before', async () => {
    const spec = await loadTheme('base');
    for (let i = 0; i < 200; i++) {
      const theme = createTheme(spec, {
        themeVariables: { primaryColor: `#${(pick(0xffffff) + 0x1000000).toString(16).slice(1)}` },
      });
      for (const n of reads()) theme.font(n);
      expect(theme.rootStyleText()).toBe(styleText(theme.rootStyle()));
    }
  });

  it('is empty without css variables', async () => {
    const theme = createTheme(await loadTheme('neo'), { cssVariables: false });
    theme.font();
    expect(theme.rootStyleText()).toBe('');
  });
});
