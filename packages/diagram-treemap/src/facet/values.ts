/**
 * What hover says of a document's values (#511): the sums the layout computes and the text the
 * renderer prints for them. Read once per parse and kept with it (the result is frozen and never
 * changes), so hovering at every offset of a large treemap stays linear.
 *
 * The options come from the text alone: the front matter's `treemap` section, then each `init`
 * directive's (its `config` key read as the treemap section, as v12's `detectInit`), the last
 * one winning. A site config the service cannot see may change them.
 */
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { treemapValueFormat } from '../format/index.ts';
import type { TreemapModel, TreemapNode } from '../model.ts';
import type { TreemapDocument } from '../parser/ast.ts';
import { code } from './tables.ts';

/** A section's sum (d3's `sum`, as the layout takes it) and its number of leaves. */
export interface Total {
  readonly value: number;
  readonly leaves: number;
}

export interface Values {
  /** The model node of each row, by AST id. */
  readonly nodes: ReadonlyMap<string, TreemapNode>;
  readonly totals: ReadonlyMap<TreemapNode, Total>;
  readonly valueFormat: string;
  readonly showValues: boolean;
  readonly format: (value: number) => string;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `valueFormat` and `showValues` as the text sets them. */
function options(text: string): { valueFormat: string; showValues: boolean } {
  const pre = preprocess(text);
  const sections: unknown[] = [pre.frontMatter?.config?.treemap];
  for (const d of pre.directives) {
    if (d.kind !== 'init' || !isPlain(d.args)) continue;
    sections.push(d.args.treemap, d.args.config);
  }
  let valueFormat = ',';
  let showValues = true;
  for (const s of sections) {
    if (!isPlain(s)) continue;
    if (typeof s.valueFormat === 'string' && s.valueFormat !== '') valueFormat = s.valueFormat;
    if (s.showValues !== undefined) showValues = s.showValues !== false;
  }
  return { valueFormat, showValues };
}

const cache = new WeakMap<object, Values>();

/** The {@link Values} of `result`, a parse of `text`. */
export function valuesOf(text: string, result: ParseResult<unknown, TreemapDocument>): Values {
  const known = cache.get(result);
  if (known) return known;
  const model = result.model as TreemapModel;
  const nodes = new Map<string, TreemapNode>();
  const totals = new Map<TreemapNode, Total>();
  // Depth first, children before their section: d3's `+value || 0` plus the children's.
  const stack: { node: TreemapNode; next: number }[] = model.roots.map((node) => ({
    node,
    next: 0,
  }));
  stack.reverse();
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const { node } = top;
    if (top.next === 0) nodes.set(node.astId, node);
    const child = node.children[top.next];
    if (child) {
      top.next++;
      stack.push({ node: child, next: 0 });
      continue;
    }
    stack.pop();
    let value = +(node.value ?? 0) || 0;
    let leaves = node.type === 'Leaf' ? 1 : 0;
    for (const c of node.children) {
      const t = totals.get(c);
      value += t?.value ?? 0;
      leaves += t?.leaves ?? 0;
    }
    totals.set(node, { value, leaves });
  }
  const { valueFormat, showValues } = options(text);
  const values: Values = {
    nodes,
    totals,
    valueFormat,
    showValues,
    format: treemapValueFormat(valueFormat),
  };
  cache.set(result, values);
  return values;
}

/** What the renderer prints for `value` (D402: nothing for 0, NaN or a value too large). */
export function drawnValue(value: number, v: Values): string {
  if (Number.isNaN(value)) return 'not a number, so the leaf takes no area and shows no value';
  if (!Number.isFinite(value)) return 'too large to draw, so no value is shown';
  const shown = code(v.format(value));
  if (value === 0) return `${shown}; no value is shown for 0`;
  if (!v.showValues) return `${shown}; not shown, since \`showValues\` is off`;
  return shown;
}
