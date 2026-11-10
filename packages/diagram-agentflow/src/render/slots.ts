/**
 * Palette slots (v12 `colorSlots.ts`): a vertex takes the fixed slot of its kind, so a tool is
 * the same colour in every diagram; flows cycle the slots above the kinds' seven, in
 * declaration order, so a frame never takes the colour of a kind inside it. A collapsed flow
 * keeps its flow's slot. On only when the theme carries a non-empty `borderColorArray`, never
 * by theme name (D152); the fill comes from `bkgColorArray` only when that is not empty, so
 * `redux-dark-color` colours borders only.
 */
import type { SafeColor } from '@mermaid-js/core/svg';
import type { AgentflowModel, VertexKind } from '../parser/index.ts';

/** Fixed slot per kind (v12 `KIND_SLOT`). */
const KIND_SLOT: Readonly<Record<VertexKind, number>> = {
  tool: 0,
  task: 1,
  decision: 2,
  input: 3,
  refdoc: 4,
  connector: 5,
  action: 6,
};
/** Slots the kinds hold; flows cycle the ones above. */
const KIND_COUNT = 7;

/** A palette slot as drawn: `data-color-id`, the stroke and, with `bkgColorArray`, the fill. */
export interface Tint {
  readonly id: `color-${number}`;
  readonly stroke: SafeColor;
  readonly fill?: SafeColor;
}

/** The theme's palettes, or undefined when per-item colour is off. */
export interface Palette {
  readonly border: readonly SafeColor[];
  readonly bkg: readonly SafeColor[];
}

/**
 * The tint of palette slot `slot` as v12's stylesheet drew it (`styles.ts` `genColor`): the
 * border `border[slot mod length]`, the fill `bkg[slot mod its length]`.
 */
function tint(p: Palette, slot: number): Tint {
  const s = slot % p.border.length;
  return {
    id: `color-${s}`,
    stroke: p.border[s]!,
    fill: p.bkg.length > 0 ? p.bkg[slot % p.bkg.length] : undefined,
  };
}

/** A vertex's tint: its kind's slot, as is (v12 indexes both palettes with it). */
export const kindTint = (p: Palette, kind: VertexKind): Tint => tint(p, KIND_SLOT[kind]);

/**
 * The `n`th flow's tint (v12 `containerSlot`): `7 + n mod (length − 7)`, at least one slot to
 * cycle, then wrapped to the border palette's length, so a palette shorter than eight reuses a
 * kind's colour; the fill reads `bkgColorArray` at that wrapped slot, as v12's rule for it did.
 */
export const flowTint = (p: Palette, n: number): Tint =>
  tint(p, (KIND_COUNT + (n % Math.max(1, p.border.length - KIND_COUNT))) % p.border.length);

/**
 * Each flow's number in declaration order (v12 `getData`'s container walk): a pre-order walk
 * of the containment forest, roots and children in completion order (the model's), which is
 * the order the author opened them in. Hidden flows are numbered too, so collapsing a flow
 * recolours none after it.
 */
export function flowOrder(model: AgentflowModel): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const f of model.flows) {
    if (f.parent === undefined) continue;
    let list = children.get(f.parent);
    if (!list) children.set(f.parent, (list = []));
    list.push(f.id);
  }
  const order = new Map<string, number>();
  for (const f of model.flows) {
    if (f.parent !== undefined) continue;
    // Iterative pre-order: the nesting is a forest after the containment cut (D461).
    const stack = [f.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (order.has(id)) continue;
      order.set(id, order.size);
      const kids = children.get(id);
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
    }
  }
  // A flow the walk did not reach (none after the cut) still takes a slot of its own.
  for (const f of model.flows) if (!order.has(f.id)) order.set(f.id, order.size);
  return order;
}
