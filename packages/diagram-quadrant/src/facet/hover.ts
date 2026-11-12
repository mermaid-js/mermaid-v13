/**
 * Quadrant hover (DESIGN §4.5, D93): a class shows its `classDef` styles and how many points
 * use it; a point's label its coordinates, class and styles; a keyword the one-line doc of the
 * grammar file (`generated/docs.ts`), and `quadrant-N` which corner it labels.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import type { QuadrantModel } from '../model.ts';
import { quadrantDocs } from '../generated/docs.ts';
import type { QuadrantClassDefNode, QuadrantDocument, QuadrantPointNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { plural, QUADRANT_PLACES, trimmed } from './tables.ts';
import { code } from '@mermaid-js/core/parser-kit/facet';

/** Glue tokens that hover as the keyword they belong to. */
const DOC_KIND: Readonly<Record<number, number>> = {
  [T.AccDescrMultiline]: T.AccDescr,
  [T.AccDescrMultilineEnd]: T.AccDescr,
};

function classHover(name: string, doc: DocumentView<QuadrantDocument>): string {
  const defs = doc.result.ast.children.filter(
    (n): n is QuadrantClassDefNode => n.type === 'ClassDef' && n.name === name
  );
  const def = defs[defs.length - 1];
  const styles =
    def === undefined
      ? 'No `classDef` defines it.'
      : code(`classDef ${name} ${def.styles.map((s) => s.text).join(', ')}`);
  const model = doc.result.model as QuadrantModel;
  const used = model.points.filter((p) => p.className === name).length;
  return `**class** ${code(name)}\n\n${styles}\n\nUsed by ${plural(used, 'point')}`;
}

function pointHover(p: QuadrantPointNode): string {
  const facts = [`x ${code(p.x)}, y ${code(p.y)}`];
  if (p.className !== undefined) facts.push(`Class: ${code(p.className)}`);
  if (p.styles.length > 0) facts.push(`Styles: ${code(p.styles.map((s) => s.text).join(', '))}`);
  return `**point** ${code(p.name)}\n\n${facts.join(' · ')}`;
}

export function quadrantHover(
  at: HoverTarget,
  doc: DocumentView<QuadrantDocument>
): Hover | undefined {
  const { text, result } = doc;
  if (at.symbol?.kind === 'class') {
    return { range: at.symbol.range, contents: classHover(at.symbol.name, doc) };
  }
  for (const n of result.ast.children) {
    if (n.type !== 'Point') continue;
    const r = n.label.range;
    if (r.start <= at.offset && at.offset <= r.end) return { range: r, contents: pointHover(n) };
  }
  const t = at.token;
  if (!t) return undefined;
  const range = trimmed(text, t.range);
  if (at.offset < range.start || at.offset > range.end || range.start === range.end) {
    return undefined;
  }
  const kind = DOC_KIND[t.kind] ?? t.kind;
  const docText = quadrantDocs[kind];
  if (docText === undefined) return undefined;
  const word = text.slice(range.start, range.end);
  const place = QUADRANT_PLACES[kind];
  const head = `**${code(word)}**${place === undefined ? '' : ` the ${place} quadrant`}`;
  return { range, contents: `${head}\n\n${docText}` };
}
