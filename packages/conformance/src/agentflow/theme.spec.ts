/**
 * #548: agentflow's paints in all eleven themes against what v12.2.0 drew (D151: v12 is the
 * oracle). jsdom computes no styles, so the v12 side is pinned: the computed styles of 12.2.0's
 * `dist/mermaid.min.js` in headless Chromium (pitfall 17), for a task, a flow's frame and a
 * collapsed card (the separator and the dots) of one diagram. v12 drew agentflow with
 * `look: neo` whatever the theme (`AgentflowDiagramConfig.look` defaults to `neo`), so its frame
 * and outlines took neo's `[data-look="neo"]` rules: `nodeBorder` (the gradient where the theme
 * has one) and the shadow.
 *
 * The v13 side is read off the render: the task's and the frame's stroke (`gradient` for the
 * neo gradient), fill, width and shadow, the separator's and the dots' colours, resolved through
 * the theme. Every pair that differs is in `DIFFERENCES` with the decision that makes it, and
 * the list has to match the differences found exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  THEME_NAMES,
  createTheme,
  formatColor,
  loadTheme,
  parseColor,
  type ThemeName,
} from '@mermaid-js/core/theme';
import type { Attrs, OutlineDraw } from '@mermaid-js/core/svg';
import { agentflow } from '@mermaid-js/diagram-agentflow';
import { renderAgentflowForTest } from '@mermaid-js/diagram-agentflow/testing';

const SOURCE = `agentflow-beta TB
  flow outer["Outer"]
    t2["Task"]@{ shape: task }
  end
  flow coll["Collapsed"]
    s --> u
  end
  coll@{ view: "collapsed" }
`;

interface Paint {
  /** Task outline: a colour or `gradient`. */
  readonly stroke: string;
  readonly fill: string;
  readonly width: number;
  readonly shadow: boolean;
  /** The frame's stroke and fill (`none`). */
  readonly frame: string;
  readonly frameFill: string;
  readonly separator: string;
  readonly dots: string;
  /**
   * What the hand-drawn hook gets (`w.outline`): the frame's stroke, fill and shadow (`F`/`-`),
   * then the card's stroke and fill.
   */
  readonly handDrawn: string;
}

/** 12.2.0's computed styles (Chromium), redux-color's frame being the first flow's slot. */
const V12: Readonly<Record<ThemeName, Omit<Paint, 'handDrawn'>>> = {
  default: {
    stroke: '#9370db',
    fill: '#ececff',
    width: 1,
    shadow: true,
    frame: '#9370db',
    frameFill: 'none',
    separator: '#eeeebc',
    dots: '#9370db',
  },
  dark: {
    stroke: 'gradient',
    fill: '#1f2020',
    width: 1,
    shadow: true,
    frame: 'gradient',
    frameFill: 'none',
    separator: '#2f2f2f',
    dots: '#cccccc',
  },
  forest: {
    stroke: 'gradient',
    fill: '#cde498',
    width: 1,
    shadow: true,
    frame: 'gradient',
    frameFill: 'none',
    separator: '#b4e599',
    dots: '#13540c',
  },
  neutral: {
    stroke: 'gradient',
    fill: '#eeeeee',
    width: 1,
    shadow: true,
    frame: 'gradient',
    frameFill: 'none',
    separator: '#e3e3e3',
    dots: '#999999',
  },
  base: {
    stroke: 'gradient',
    fill: '#fff4dd',
    width: 1,
    shadow: true,
    frame: 'gradient',
    frameFill: 'none',
    separator: '#debbee',
    dots: '#eedebb',
  },
  redux: {
    stroke: '#28253d',
    fill: '#ffffff',
    width: 2,
    shadow: true,
    frame: '#28253d',
    frameFill: 'none',
    separator: '#b3b3b3',
    dots: '#28253d',
  },
  'redux-dark': {
    stroke: '#ffffff',
    fill: '#111113',
    width: 2,
    shadow: true,
    frame: '#ffffff',
    frameFill: 'none',
    separator: '#2f2f2f',
    dots: '#ffffff',
  },
  'redux-color': {
    stroke: '#2dd4bf',
    fill: '#f0fdfa',
    width: 2,
    shadow: true,
    frame: '#facc15',
    frameFill: '#fefce8',
    separator: '#b3b3b3',
    dots: '#28253d',
  },
  'redux-dark-color': {
    stroke: '#2dd4bf',
    fill: '#111113',
    width: 2,
    shadow: true,
    frame: '#facc15',
    frameFill: 'none',
    separator: '#2f2f2f',
    dots: '#ffffff',
  },
  neo: {
    stroke: 'gradient',
    fill: '#ffffff',
    width: 2,
    shadow: true,
    frame: 'gradient',
    frameFill: 'none',
    separator: '#b3b3b3',
    dots: '#000000',
  },
  'neo-dark': {
    stroke: 'gradient',
    fill: '#2a2020',
    width: 1,
    shadow: true,
    frame: 'gradient',
    frameFill: 'none',
    separator: '#2f2f2f',
    dots: '#cccccc',
  },
};

/**
 * 12.2.0 under `look: handDrawn` (computed styles): roughjs draws the frame and the card as a
 * `<path>`, which neither `.flow-cluster rect` nor neo's `.cluster rect` match, so both keep the
 * `flowContainerStroke` attribute, unfilled and without the shadow; only the palette's
 * `[data-color-id].cluster path` rule recolours (and, under redux-color, fills) a frame.
 */
const HAND_DRAWN = (frame: string, card = frame, fill = 'none') =>
  `frame ${frame} ${fill} -; card ${card} none`;
const V12_HAND_DRAWN: Readonly<Record<ThemeName, string>> = {
  default: HAND_DRAWN('#eeeebc'),
  dark: HAND_DRAWN('#2f2f2f'),
  forest: HAND_DRAWN('#b4e599'),
  neutral: HAND_DRAWN('#e3e3e3'),
  base: HAND_DRAWN('#debbee'),
  redux: HAND_DRAWN('#b3b3b3'),
  'redux-dark': HAND_DRAWN('#2f2f2f'),
  'redux-color': HAND_DRAWN('#facc15', '#b3b3b3', '#fefce8'),
  'redux-dark-color': HAND_DRAWN('#facc15', '#2f2f2f'),
  neo: HAND_DRAWN('#b3b3b3'),
  'neo-dark': HAND_DRAWN('#2f2f2f'),
};

const CLASSIC = ['default', 'dark', 'forest', 'neutral', 'base'];
/**
 * Themes whose border colours v13 derives with core's rule, where v12 used khroma's `mkBorder`;
 * the named classic themes pin v12's (#798).
 */
const DERIVED = ['base', 'redux', 'redux-color'];

/**
 * Each difference from 12.2.0, by `<theme>.<paint>`, with the decision that makes it. The first
 * is the neo-default difference: v12 forced `look: neo` on agentflow, so the classic themes drew
 * neo's shadow, and four of them neo's gradient; v13 has no look (D153) and draws each family
 * as its theme says (D152, D227).
 */
const NEO_DEFAULT =
  'D152, D153, D227: v12 drew agentflow with `look: neo` in every theme; v13 has no look, so the classic family draws without the neo gradient and shadow';
const BORDER_RULE =
  "core's border derivation (`mix(<colour>, black, 15%)`, theme-variables.md) where v12 used khroma's mkBorder: flowContainerStroke is secondaryBorderColor, the dots nodeBorder";
/**
 * v13 draws a frame and a card the same with or without the hand-drawn plugin: the renderer
 * never branches on it (D152, D301), and an outline drawer gets only the role and the paint, so
 * the plugin can't tell a frame's `nodeBorder` from v12's sketched `flowContainerStroke` either.
 */
const HAND_DRAWN_PAINT =
  'D152, D301, D302: v12 sketched frames and cards as paths its stylesheet missed (flowContainerStroke, unfilled, no shadow); v13 hands w.outline the paint it draws without the plugin';
const DIFFERENCES: Readonly<Record<string, string>> = Object.fromEntries<string>([
  ...THEME_NAMES.map((t): [string, string] => [`${t}.handDrawn`, HAND_DRAWN_PAINT]),
  ...CLASSIC.map((t): [string, string] => [`${t}.shadow`, NEO_DEFAULT]),
  ...['dark', 'forest', 'neutral', 'base'].flatMap((t): [string, string][] => [
    [`${t}.stroke`, NEO_DEFAULT],
    [`${t}.frame`, NEO_DEFAULT],
  ]),
  ...DERIVED.map((t): [string, string] => [`${t}.separator`, BORDER_RULE]),
  ['base.dots', BORDER_RULE],
  ['neo-dark.width', 'D183: 2, as in neo; v12 neo-dark drew with 1'],
  [
    'neo-dark.separator',
    'D183: secondaryBorderColor derived with the dark rules; v12 never set darkMode',
  ],
]);

const hex = (v: string): string => {
  const c = parseColor(v);
  return c ? formatColor(c) : v;
};

/** The start-tag attributes of the first `<tag>` in `svg` from the tag that holds `from` on. */
function first(svg: string, tag: string, from: string): Record<string, string> {
  const at = svg.lastIndexOf('<', svg.indexOf(from));
  const m = new RegExp(`<${tag}\\b([^>]*?)/?>`).exec(svg.slice(at));
  const out: Record<string, string> = {};
  for (const a of m![1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) out[a[1]!] = a[2]!;
  return out;
}

async function v13(name: ThemeName): Promise<Paint> {
  // The frame (`group`) and the card (the `flow-collapsed` rect) as a drawer receives them.
  const sketched: { frame?: Attrs; card?: Attrs } = {};
  const outline: OutlineDraw = (role, _tag, attrs) => {
    if (role === 'group') sketched.frame ??= attrs;
    if (role === 'node' && attrs.class === 'flow-collapsed') sketched.card = attrs;
    return false;
  };
  const r = await renderAgentflowForTest(SOURCE, { config: { theme: name }, outline });
  const theme = createTheme(await loadTheme(name), {
    diagram: agentflow.theme,
    cssVariables: false,
  });
  // An alias `var(--_x)` resolves to the theme variable it is declared for.
  const aliases = new Map(
    [...r.svg.matchAll(/--_([\w-]+):var\(--mermaid-([\w-]+),/g)].map((m) => [m[1]!, m[2]!])
  );
  const resolve = (v: string | undefined): string => {
    if (v === undefined) return 'none';
    if (v.startsWith('url(')) return 'gradient';
    const alias = /^var\(--_([\w-]+)\)$/.exec(v)?.[1];
    return alias ? hex(theme.value(aliases.get(alias)!)) : hex(v);
  };
  const paint = (v: Attrs['stroke']): string => resolve(v);
  const task = first(r.svg, 'rect', 'data-id="t2"');
  const frame = first(r.svg, 'rect', 'data-id="outer"');
  return {
    stroke: resolve(task.stroke),
    fill: resolve(task.fill),
    width: theme.number('strokeWidth'),
    shadow: task.filter !== undefined && frame.filter !== undefined,
    frame: resolve(frame.stroke),
    frameFill: resolve(frame.fill),
    separator: resolve(first(r.svg, 'line', 'collapsed-separator').stroke),
    dots: resolve(first(r.svg, 'circle', 'collapsed-indicator').fill),
    handDrawn: `frame ${paint(sketched.frame?.stroke)} ${paint(sketched.frame?.fill)} ${
      sketched.frame?.filter === undefined ? '-' : 'F'
    }; card ${paint(sketched.card?.stroke)} ${paint(sketched.card?.fill)}`,
  };
}

describe('agentflow paints against 12.2.0 in all eleven themes', () => {
  it('differs from v12 only where DIFFERENCES says, and each entry is a difference found', async () => {
    const found: string[] = [];
    for (const name of THEME_NAMES) {
      const now = await v13(name);
      const then: Paint = { ...V12[name], handDrawn: V12_HAND_DRAWN[name] };
      for (const key of Object.keys(then) as (keyof Paint)[])
        if (now[key] !== then[key]) found.push(`${name}.${key}`);
    }
    expect(found.sort()).toEqual(Object.keys(DIFFERENCES).sort());
  });
});
