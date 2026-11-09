import type { Paint } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import {
  RAILROAD_COLOUR_KEYS,
  railroadColourOverrides,
  type RailroadColourKey,
} from '../config.ts';
import type { RailroadExpressionLayout, RailroadLayout } from '../layout/index.ts';
import type { RailroadNodeKind } from '../model.ts';

/** The railroad paints, by v12's style key: `paints.get('terminalFill')`. */
export interface Paints {
  get(key: RailroadColourKey): Paint;
}

/** The colour keys each drawn part needs. */
const RULE_KEYS: readonly RailroadColourKey[] = ['ruleNameColor', 'markerFill', 'lineColor'];
const KIND_KEYS: Partial<Record<RailroadNodeKind, readonly RailroadColourKey[]>> = {
  terminal: ['terminalFill', 'terminalStroke', 'terminalTextColor'],
  nonterminal: ['nonTerminalFill', 'nonTerminalStroke', 'nonTerminalTextColor'],
  // v12's `.railroad-special text` is filled with the nonterminal text colour.
  special: ['specialFill', 'specialStroke', 'nonTerminalTextColor'],
};

/** The colour keys `layout` draws with. */
function keysOf(layout: RailroadLayout): Set<RailroadColourKey> {
  const keys = new Set<RailroadColourKey>(layout.rules.length > 0 ? RULE_KEYS : []);
  const kinds = new Set<RailroadNodeKind>();
  const stack: RailroadExpressionLayout[] = layout.rules.map((r) => r.definition);
  for (let e = stack.pop(); e; e = stack.pop()) {
    kinds.add(e.kind);
    stack.push(...e.children);
  }
  for (const kind of kinds) for (const k of KIND_KEYS[kind] ?? []) keys.add(k);
  return keys;
}

/**
 * The paints a render draws with (D515, D516): the `railroad` config's colour where it sets a
 * usable one, else the theme variable for that key. Only the keys `layout` draws are read
 * (pitfall 18), so a diagram with no special declares no special colours under `auto`; all of
 * them before the root is written, so its style declares their aliases.
 */
export function paints(
  theme: Pick<Theme, 'color'>,
  section: Readonly<Record<string, unknown>> | undefined,
  layout: RailroadLayout
): Paints {
  const config = railroadColourOverrides(section);
  const read = new Map<RailroadColourKey, Paint>();
  for (const key of keysOf(layout))
    read.set(key, config[key] ?? theme.color(RAILROAD_COLOUR_KEYS[key]));
  return {
    get(key) {
      const p = read.get(key);
      if (p === undefined) throw new Error(`railroad paint ${key} was not read`);
      return p;
    },
  };
}
