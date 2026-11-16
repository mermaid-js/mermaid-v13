/**
 * Agentflow completion (DESIGN §4.5, D95, R-LANG-7), on the flow family's mapping
 * (`@mermaid-js/shared/parser/flow-facet`, which agentflow shares with flowchart, D467): the
 * probe's expected kinds and lexer mode mapped to items. Keywords (`flow`, `connector`,
 * `global`, `end` and flowchart's statements) are offered only when the parser tests their kind
 * at the cursor; the token before the cursor tells id kinds apart (a node after a link, a
 * class after `:::`). Inside `@{ … }`: the keys the model reads for what the block belongs to
 * (a node, a flow, an edge), then `shape:` values (the six kind aliases first), a flow's
 * `view: collapsed` and an edge's values. Where a link may start: the three links.
 *
 * Probe edges, as flowchart's: `agentflow-beta |` at the end of the text probes as a statement
 * start, so the header line is checked by position; `A --|` probes as edge text, so the rest
 * of the arrow is offered from the link start token; shape data is one token, so the
 * replacement range is worked out from its text; label and string modes get nothing; an arrow
 * glued to an id (`A-`) lexes as part of the id, so it is found from the text.
 */
import { flowCompletions } from '@mermaid-js/shared/parser/flow-facet';
import { agentflowCategories } from '../generated/categories.ts';
import { agentflowDocs } from '../generated/docs.ts';
import type { AgentflowModel } from '../parser/model.ts';
import { destructLink } from '../parser/model.ts';
import { READ_PAST } from '../parser/tables.ts';
import { T } from '../parser/tokens.ts';
import {
  ARROWS,
  CLOSERS,
  DATA_KEYS,
  describeLink,
  KEYWORDS,
  KIND_ALIASES,
  SHAPE_VALUES,
} from './tables.ts';
import type { DataOwner } from './tables.ts';

/**
 * What the `@{ … }` after the id `name` belongs to: a flow (its header, or a mention of its id:
 * v12 routes that metadata to the flow), a connector, an edge id (`e1@{ … }` after
 * `A e1@--> B`) or a node.
 */
function dataOwner(model: AgentflowModel, name: string, head: number): DataOwner {
  if (head === T.Flow) return 'flow';
  if (head === T.Connector) return 'connector';
  if (name === '') return 'node';
  if (model.flows.some((f) => f.id === name)) return 'flow';
  if (model.connectors.includes(name)) return 'connector';
  return model.edges.some((e) => e.id === name) ? 'edge' : 'node';
}

/** The keys and values of `owner`, which the family hands back as it got it from `dataOwner`. */
const dataOf = (owner: string) => DATA_KEYS[owner as DataOwner];

/** A used id's detail: its kind, and its label or title when that is not the id. */
function idDetail(model: AgentflowModel): (name: string) => string | undefined {
  const details = new Map<string, string>();
  for (const v of model.vertices) {
    details.set(v.id, v.text === v.id || v.text === '' ? v.kind : `${v.kind}: ${v.text}`);
  }
  for (const f of model.flows) {
    details.set(f.id, f.title === f.id || f.title === '' ? 'flow' : `flow: ${f.title}`);
  }
  return (name) => details.get(name);
}

export const agentflowCompletions = /* @__PURE__ */ flowCompletions<AgentflowModel>({
  kinds: T,
  categories: agentflowCategories,
  docs: agentflowDocs,
  readPast: READ_PAST,
  keywords: KEYWORDS,
  arrows: ARROWS,
  closers: CLOSERS,
  arrowChars: '-.',
  arrowHead: false,
  edgeTextModes: ['edgeText'],
  // A `%%` comment is a separator (jison).
  separators: [T.Comment],
  // A new flow's or connector's id.
  naming: [T.Flow, T.Connector],
  linkDetail: (arrow) => describeLink(destructLink(arrow).semantic),
  containers: (model) => model.flows.map((f) => f.id),
  idDetail,
  // The id with a label, and with each kind alias's metadata.
  idForms: (items, word) => {
    items.add(`${word}[${word}]`, 'shape', { detail: 'task with a label' });
    for (const alias of KIND_ALIASES) {
      items.add(`${word}@{ shape: ${alias} }`, 'shape', { detail: alias });
    }
  },
  dataOwner,
  dataKeys: (owner) => Object.keys(dataOf(owner)),
  // Shape names after a node's `shape:`, a flow's `view:`, an edge's `animate`, `animation`
  // and `curve` values.
  dataValues: (items, owner, key) => {
    if (owner === 'node' && key === 'shape') {
      for (const s of SHAPE_VALUES) items.add(s.name, 'shape', { detail: s.detail });
      return;
    }
    for (const value of dataOf(owner)[key] ?? []) items.add(value, 'constant');
  },
});
