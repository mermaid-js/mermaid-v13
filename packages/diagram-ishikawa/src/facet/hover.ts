/**
 * Ishikawa hover (DESIGN §4.5, D93, spec #519 "Language facet"): a cause names its depth in
 * the tree, the cause it hangs under, the side of the spine it is drawn on (a top-level cause's
 * own, a sub-cause its top-level cause's: v12 drew the first, third, … above the spine and the
 * others below it), its sub-causes, and whether the baseline clamp made it a top-level cause
 * (D496); the effect its cause count; the keyword its one-line doc from the grammar file
 * (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget, Range } from '@mermaid-js/core/parser-kit';
import { ISHIKAWA_INDENT_CLAMPED } from '../codes.ts';
import { ishikawaDocs } from '../generated/docs.ts';
import type { IshikawaCause, IshikawaModel } from '../model.ts';
import type { IshikawaDocument, IshikawaLineNode } from '../parser/ast.ts';
import { code } from './tables.ts';

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n === 0 ? 'no' : n} ${n === 1 ? one : many}`;

/** The line holding `at` (AST nodes are in source order and never overlap). */
function lineAt(doc: DocumentView<IshikawaDocument>, at: number): IshikawaLineNode | undefined {
  const nodes = doc.result.ast.children;
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = nodes[mid]!;
    if (n.range.end < at) lo = mid + 1;
    else if (n.range.start > at) hi = mid - 1;
    else return n;
  }
  return undefined;
}

/** Every cause under `causes`, at any depth. */
function count(causes: readonly IshikawaCause[]): number {
  let n = 0;
  const stack = [...causes];
  for (let c = stack.pop(); c; c = stack.pop()) {
    n++;
    stack.push(...c.causes);
  }
  return n;
}

function effectHover(model: IshikawaModel, text: string): string {
  const top = model.causes.length;
  const all = count(model.causes);
  const causes =
    all > top ? `${plural(top, 'cause')}, ${all} with their sub-causes` : plural(top, 'cause');
  return `**effect** ${code(text)}\n\nThe head of the fish · ${causes}`;
}

/** The 1-based tree position an AST id `cause:<i>.<j>…` names (D497). */
const positionOf = (ast: string): number[] => ast.slice('cause:'.length).split('.').map(Number);

/** The causes from the top-level one down to the one at `position`; empty if there is none. */
function pathTo(model: IshikawaModel, position: readonly number[]): IshikawaCause[] {
  const out: IshikawaCause[] = [];
  let list = model.causes;
  for (const k of position) {
    const c = list[k - 1];
    if (!c) return [];
    out.push(c);
    list = c.causes;
  }
  return out;
}

/**
 * Whether the parse reported the cause at `range` clamped to the top level (D496): an
 * `ISHIKAWA_INDENT_CLAMPED` at it, or the warning's `related` entry for it.
 */
function clamped(doc: DocumentView<IshikawaDocument>, range: Range): boolean {
  const at = (r: Range) => r.start === range.start && r.end === range.end;
  return doc.result.diagnostics.some(
    (d) =>
      d.code === ISHIKAWA_INDENT_CLAMPED &&
      (at(d.range) || (d.related ?? []).some((x) => at(x.range)))
  );
}

function causeHover(doc: DocumentView<IshikawaDocument>, ast: string): string | undefined {
  const position = positionOf(ast);
  const path = pathTo(doc.result.model as IshikawaModel, position);
  const cause = path[path.length - 1];
  if (!cause) return undefined;
  const depth = path.length;
  const parent = path[depth - 2];
  const side = position[0]! % 2 === 1 ? 'above the spine' : 'below the spine';
  const place =
    parent === undefined
      ? `Depth 1, a top-level cause, ${side}`
      : `Depth ${depth}, under ${code(parent.text)}, ${side}`;
  const facts = [`${place} · ${plural(cause.causes.length, 'sub-cause')}`];
  if (clamped(doc, cause.range)) {
    facts.push(
      'Indented less than the first cause, so read as a top-level cause (mermaid@12 does the same).'
    );
  }
  return `**cause** ${code(cause.text)}\n\n${facts.join('\n\n')}`;
}

export function ishikawaHover(
  at: HoverTarget,
  doc: DocumentView<IshikawaDocument>
): Hover | undefined {
  const t = at.token;
  const docText = t && ishikawaDocs[t.kind];
  if (t && docText !== undefined) {
    const { start, end } = t.range;
    return { range: t.range, contents: `**${code(doc.text.slice(start, end))}**\n\n${docText}` };
  }
  const line = lineAt(doc, at.offset);
  if (!line) return undefined;
  const contents =
    line.type === 'Effect'
      ? effectHover(doc.result.model as IshikawaModel, line.text)
      : causeHover(doc, line.id);
  return contents === undefined ? undefined : { range: line.range, contents };
}
