import type { Paint } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import { RAILROAD_COLOUR_KEYS, type RailroadColourKey } from '../config.ts';
import type { RailroadExpressionLayout, RailroadLayout } from '../layout/index.ts';
import type { RailroadNodeKind } from '../model.ts';

/** The railroad paints, by v12's style key: `paints.get('terminalFill')`. */
export interface Paints {
  get(key: RailroadColourKey): Paint;
}

/** A boxed kind's fill, stroke and text colour keys (v12 `styles.ts:274-360`). */
export interface BoxPaint {
  readonly fill: RailroadColourKey;
  readonly stroke: RailroadColourKey;
  readonly text: RailroadColourKey;
}

/** The colour keys of each boxed kind; the other kinds draw only track. */
export const BOX_PAINT: Readonly<Partial<Record<RailroadNodeKind, BoxPaint>>> = {
  terminal: { fill: 'terminalFill', stroke: 'terminalStroke', text: 'terminalTextColor' },
  nonterminal: {
    fill: 'nonTerminalFill',
    stroke: 'nonTerminalStroke',
    text: 'nonTerminalTextColor',
  },
  // v12's `.railroad-special text` is filled with the nonterminal text colour.
  special: { fill: 'specialFill', stroke: 'specialStroke', text: 'nonTerminalTextColor' },
};

/** What every rule draws: its name, its markers and track. */
const RULE_KEYS: readonly RailroadColourKey[] = ['ruleNameColor', 'markerFill', 'lineColor'];

/** The colour keys `layout` draws with. */
function keysOf(layout: RailroadLayout): Set<RailroadColourKey> {
  const keys = new Set<RailroadColourKey>(layout.rules.length > 0 ? RULE_KEYS : []);
  const stack: RailroadExpressionLayout[] = layout.rules.map((r) => r.definition);
  for (let e = stack.pop(); e; e = stack.pop()) {
    const box = BOX_PAINT[e.kind];
    if (box) for (const k of [box.fill, box.stroke, box.text]) keys.add(k);
    stack.push(...e.children);
  }
  return keys;
}

/**
 * The paints a render draws with (D515, D516): the `railroad` config's colour where it sets a
 * usable one (`layout.config.colours`), else the theme variable for that key. Only the keys the
 * layout draws are read, so a diagram with no special declares no special colours under `auto`;
 * all of them before the root is written, so its style declares their aliases.
 */
export function paints(theme: Pick<Theme, 'color'>, layout: RailroadLayout): Paints {
  const { colours } = layout.config;
  const read = new Map<RailroadColourKey, Paint>();
  for (const key of keysOf(layout))
    read.set(key, colours[key] ?? theme.color(RAILROAD_COLOUR_KEYS[key]));
  return {
    get(key) {
      const p = read.get(key);
      if (p === undefined) throw new Error(`railroad paint ${key} was not read`);
      return p;
    },
  };
}
