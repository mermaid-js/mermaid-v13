/**
 * Mindmap hover (DESIGN §4.5, D93): a node (its id, delimiters or text) names its shape, as
 * written, with its place in the tree, classes and icon; a class its use; `mindmap`, `::icon(`
 * and `:::` their one-line doc from the grammar file (`generated/docs.ts`). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { mindmapDocs } from '../generated/docs.ts';
import type { MindmapModel } from '../model.ts';
import type { MindmapDocument, MindmapNodeNode } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { code, SHAPE_NAMES, span } from './tables.ts';
import { plural, statementOverlapping } from '@mermaid-js/shared/parser/facet';

/** The tokens of a node statement. */
const NODE_TOKENS = new Set<number>([
  T.NodeId,
  T.NodeDStart,
  T.NodeDescr,
  T.NodeDEnd,
  T.StringStart,
  T.StringEnd,
  T.MdStringStart,
  T.MdStringEnd,
]);

/** How `node` is written: its opener and closer as in the source, `…` for its text. */
function written(doc: DocumentView<MindmapDocument>, node: MindmapNodeNode): string | undefined {
  const t = doc.result.tokens;
  if (!t) return undefined;
  let open = '';
  let close = '';
  for (let j = 0; j < t.length; j++) {
    const start = t.start[j] ?? 0;
    if (start >= node.range.end) break;
    if (start < node.range.start) continue;
    const kind = t.kind[j];
    const text = doc.text.slice(start, t.end[j] ?? 0);
    if (kind === T.NodeDStart && open === '') open = text;
    else if (kind === T.NodeDEnd) close = text;
  }
  return open === '' ? undefined : `${open}…${close}`;
}

function nodeHover(doc: DocumentView<MindmapDocument>, node: MindmapNodeNode): string {
  const id = node.nodeId?.trim();
  const title = id === undefined || id === '' ? '**node**' : `**node** ${code(id)}`;
  const form = written(doc, node);
  const shape = SHAPE_NAMES[node.shape];
  const facts = [form === undefined ? `Shape: ${shape}` : `Shape: ${shape}, written ${code(form)}`];
  const model = doc.result.model as MindmapModel;
  const m = model.nodes.find((x) => x.ast === node.id);
  if (!m) return `${title}\n\n${facts.join('\n\n')}\n\nNot in the tree: a mindmap has one root.`;
  const parent = m.parent === undefined ? undefined : model.nodes[m.parent];
  const place =
    parent === undefined
      ? `The root · ${plural(m.children.length, 'child', 'children')}`
      : `Depth ${m.depth}, under ${code(parent.id.trim())} · ${plural(m.children.length, 'child', 'children')}`;
  facts.push(place);
  if (m.classes.length > 0) {
    facts.push(
      `${m.classes.length === 1 ? 'Class' : 'Classes'}: ${m.classes.map(code).join(', ')}`
    );
  }
  if (m.icon) facts.push(`Icon: ${code(m.icon.text.trim())}`);
  return `${title}\n\n${facts.join('\n\n')}`;
}

function classHover(name: string, model: MindmapModel): string {
  const n = model.nodes.filter((x) => x.classes.includes(name)).length;
  return `**class** ${code(name)}\n\nUsed by ${plural(n, 'node')}`;
}

export function mindmapHover(
  at: HoverTarget,
  doc: DocumentView<MindmapDocument>
): Hover | undefined {
  const s = at.symbol;
  if (s?.kind === 'class') {
    return { range: s.range, contents: classHover(s.name, doc.result.model as MindmapModel) };
  }
  const t = at.token;
  if (!t) return undefined;
  const docText = mindmapDocs[t.kind];
  if (docText !== undefined) {
    const { start, end } = t.range;
    const word = doc.text.slice(start, end);
    return { range: span(start, end), contents: `**${code(word)}**\n\n${docText}` };
  }
  if (!NODE_TOKENS.has(t.kind)) return undefined;
  const node = statementOverlapping(doc.result.ast.children, at.offset);
  if (!node) return undefined;
  return { range: node.range, contents: nodeHover(doc, node) };
}
