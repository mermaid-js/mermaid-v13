/**
 * Expression trees as the parsers build them ({@link Draft}: kind, source range, children),
 * and the step that turns a rule's draft into its model node and AST node with their ids
 * (D517: `<rule id>/<path>`, the path being child indices from the rule down).
 *
 * The constructors apply v12's mappings: a one-element sequence or choice is its element
 * (`transformSequence`/`transformChoice` and their IR, ABNF and PEG twins).
 */
import type { AstId, Range } from '@mermaid-js/core/parser-kit';
import type { RailroadNode, RailroadNodeKind } from '../model.ts';
import type { RailroadExpressionNode } from './ast.ts';

export interface Draft {
  type: RailroadNodeKind;
  range: Range;
  /** A terminal's value, a nonterminal's name or a special's text. */
  text: string;
  /** A repetition's bounds. */
  min: number;
  max: number;
  children: Draft[];
  /** Levels of the tree from this node down: 1 for a leaf. */
  height: number;
}

/** A terminal, nonterminal or special. */
export function leaf(
  type: 'terminal' | 'nonterminal' | 'special',
  text: string,
  range: Range
): Draft {
  return { type, range, text, min: 0, max: 0, children: [], height: 1 };
}

const above = (items: readonly Draft[]): number =>
  1 + items.reduce((h, d) => Math.max(h, d.height), 0);

const span = (items: readonly Draft[]): Range => ({
  start: items[0]?.range.start ?? 0,
  end: items[items.length - 1]?.range.end ?? 0,
});

/** A sequence of `items`, or the one item. */
export function sequence(items: Draft[], range: Range = span(items)): Draft {
  if (items.length === 1 && items[0]) return items[0];
  return {
    type: 'sequence',
    range,
    text: '',
    min: 0,
    max: 0,
    children: items,
    height: above(items),
  };
}

/** A choice between `items`, or the one item. */
export function choice(items: Draft[], range: Range = span(items)): Draft {
  if (items.length === 1 && items[0]) return items[0];
  return { type: 'choice', range, text: '', min: 0, max: 0, children: items, height: above(items) };
}

export function optional(item: Draft, range: Range): Draft {
  return {
    type: 'optional',
    range,
    text: '',
    min: 0,
    max: 0,
    children: [item],
    height: item.height + 1,
  };
}

export function repetition(item: Draft, min: number, max: number, range: Range): Draft {
  return {
    type: 'repetition',
    range,
    text: '',
    min,
    max,
    children: [item],
    height: item.height + 1,
  };
}

/** The model node and the AST node of `d`, whose id is `id`; its children's ids extend it. */
export function build(d: Draft, id: AstId): [RailroadNode, RailroadExpressionNode] {
  const kids = d.children.map((c, k) => build(c, `${id}/${k}`));
  const ast: RailroadExpressionNode = { id, type: d.type, range: d.range };
  if (kids.length > 0) ast.children = kids.map((k) => k[1]);
  const nodes = kids.map((k) => k[0]);
  const first = nodes[0] as RailroadNode;
  let node: RailroadNode;
  switch (d.type) {
    case 'terminal':
      node = { type: 'terminal', astId: id, value: d.text };
      break;
    case 'nonterminal':
      node = { type: 'nonterminal', astId: id, name: d.text };
      break;
    case 'special':
      node = { type: 'special', astId: id, text: d.text };
      break;
    case 'sequence':
      node = { type: 'sequence', astId: id, elements: nodes };
      break;
    case 'choice':
      node = { type: 'choice', astId: id, alternatives: nodes };
      break;
    case 'optional':
      node = { type: 'optional', astId: id, element: first };
      break;
    case 'repetition':
      node = { type: 'repetition', astId: id, element: first, min: d.min, max: d.max };
      break;
  }
  return [node, ast];
}
