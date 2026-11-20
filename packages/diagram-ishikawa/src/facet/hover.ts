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
import { causeCount, sideOf, type IshikawaCause, type IshikawaModel } from '../model.ts';
import { positionOf } from '../parser/ast-ids.ts';
import type { IshikawaDocument } from '../parser/ast.ts';
import { code } from './tables.ts';
import { statementOverlapping } from '@mermaid-js/shared/parser/facet';

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n === 0 ? 'no' : n} ${n === 1 ? one : many}`;

function effectHover(model: IshikawaModel, text: string): string {
  const top = model.causes.length;
  const all = causeCount(model.causes);
  const causes =
    all > top ? `${plural(top, 'cause')}, ${all} with their sub-causes` : plural(top, 'cause');
  return `**effect** ${code(text)}\n\nThe head of the fish · ${causes}`;
}

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
 * Whether the parse reported the cause at `range` clamped to the top level (D496): the facet
 * parses with `clampPerCause`, so an `ISHIKAWA_INDENT_CLAMPED` at it.
 */
function clamped(doc: DocumentView<IshikawaDocument>, range: Range): boolean {
  return doc.result.diagnostics.some(
    (d) =>
      d.code === ISHIKAWA_INDENT_CLAMPED &&
      d.range.start === range.start &&
      d.range.end === range.end
  );
}

function causeHover(doc: DocumentView<IshikawaDocument>, ast: string): string | undefined {
  const position = positionOf(ast);
  const path = pathTo(doc.result.model as IshikawaModel, position);
  const cause = path[path.length - 1];
  if (!cause) return undefined;
  const depth = path.length;
  const parent = path[depth - 2];
  const side = sideOf(position[0]! - 1) === 'upper' ? 'above the spine' : 'below the spine';
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
  const line = statementOverlapping(doc.result.ast.children, at.offset);
  if (!line) return undefined;
  const contents =
    line.type === 'Effect'
      ? effectHover(doc.result.model as IshikawaModel, line.text)
      : causeHover(doc, line.id);
  return contents === undefined ? undefined : { range: line.range, contents };
}
