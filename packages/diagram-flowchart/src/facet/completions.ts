/**
 * Flowchart completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode
 * mapped to items. Keywords are offered only when the parser tests their kind at the cursor;
 * the token before the cursor tells id kinds apart (a node after a link, a class after `:::`).
 * The mapping is the flow family's (`@mermaid-js/shared/parser/flow-facet`); here is what
 * flowchart gives it: its keywords, arrows and docs, the keys and shape names its `@{ … }`
 * blocks take, and the bracket shapes it offers after an id.
 *
 * Probe edges handled here (tickets/27.md): `flowchart |` at the end of the text probes as a
 * statement start (v12 lexes the blank as the header's line end), so the header line is
 * checked by position; `A --|` probes as edge text (mode `edgeText`), so the rest of the arrow
 * is offered from the link start token; shape data is one token, so the replacement range is
 * worked out from its text; label and string modes get nothing.
 *
 * And from #179: inside edge text the closing arrow is offered by how the link opened (the
 * probe may be in edge-text mode or past an unclosed `--`); an arrow glued to an id (`A-`,
 * `B <-`) lexes as part of the id or a tag, so it is found from the text.
 */
import type { CompletionList as Items } from '@mermaid-js/shared/parser/facet';
import { FLOW_EDGE_DATA, flowCompletions } from '@mermaid-js/shared/parser/flow-facet';
import { flowchartCategories } from '../generated/categories.ts';
import { flowchartDocs } from '../generated/docs.ts';
import type { FlowModel } from '../parser/model.ts';
import { destructLink } from '../parser/model.ts';
import { READ_PAST } from '../parser/parser.ts';
import { acceptedShape, SHAPE_GROUPS } from '../parser/shapes.ts';
import { T } from '../parser/tokens.ts';
import {
  ARROWS,
  BRACKET_SHAPES,
  CLOSERS,
  describeLink,
  KEYWORDS,
  NODE_DATA_KEYS,
} from './tables.ts';

/** Every shape name a node's `shape:` accepts, its group's first name as the detail. */
function shapeNames(items: Items): void {
  for (const group of SHAPE_GROUPS) {
    for (const shape of group.filter(acceptedShape)) {
      items.add(shape, 'shape', { detail: shape === group[0] ? 'shape' : `same as ${group[0]}` });
    }
  }
}

/** A used node's detail: its label, when that is not its id. */
function idDetail(model: FlowModel): (name: string) => string | undefined {
  const labels = new Map(model.vertices.map((v) => [v.id, v.text]));
  return (name) => {
    const label = labels.get(name);
    return label === undefined || label === name ? undefined : label;
  };
}

export const flowchartCompletions = /* @__PURE__ */ flowCompletions<FlowModel>({
  kinds: T,
  categories: flowchartCategories,
  docs: flowchartDocs,
  readPast: READ_PAST,
  keywords: KEYWORDS,
  arrows: ARROWS,
  closers: CLOSERS,
  arrowChars: '-=.',
  arrowHead: true,
  edgeTextModes: ['edgeText', 'thickEdgeText', 'dottedEdgeText'],
  separators: [],
  naming: [T.Subgraph],
  linkDetail: (arrow, opened) => {
    const { type, stroke, length } = destructLink(arrow, opened);
    return describeLink(type, stroke, length);
  },
  containers: (model) => model.subgraphs.map((s) => s.id),
  idDetail,
  // Its bracket shapes, with the id as the label.
  idForms: (items, word) => {
    for (const [open, close, name] of BRACKET_SHAPES) {
      items.add(`${word}${open}${word}${close}`, 'shape', { detail: name });
    }
  },
  // The id before the block is an edge id (`e1@{ … }` after `A e1@--> B`), or a node's.
  dataOwner: (model, name) =>
    name !== '' && model.edges.some((e) => e.id === name) ? 'edge' : 'node',
  dataKeys: (owner) => (owner === 'edge' ? Object.keys(FLOW_EDGE_DATA) : NODE_DATA_KEYS),
  // Shape names after a node's `shape:`, an edge's `animate`, `animation` and `curve` values.
  dataValues: (items, owner, key) => {
    if (owner === 'edge')
      for (const value of FLOW_EDGE_DATA[key] ?? []) items.add(value, 'constant');
    else if (key === 'shape') shapeNames(items);
  },
});
