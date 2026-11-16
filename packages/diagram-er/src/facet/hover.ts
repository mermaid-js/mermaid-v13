/**
 * ER hover (DESIGN §4.5, D93): an entity name shows its alias, attributes, relationships and
 * classes; a subgraph id its title and members; a class its `classDef` styles; a cardinality
 * or line what it means and, inside a relationship, the relationship it is part of; a key what
 * it stands for; a keyword the one-line doc of the grammar file (`generated/docs.ts`).
 */
import type {
  DocumentView,
  Hover,
  HoverTarget,
  Range,
  SymbolOccurrence,
} from '@mermaid-js/core/parser-kit';
import { erDocs } from '../generated/docs.ts';
import type { ErDocument, ErRelationshipNode, ErStatementNode } from '../parser/ast.ts';
import type { ErModel } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';
import {
  CARDINALITY_KINDS,
  CARDINALITY_MEANING,
  code,
  describeLine,
  DIRECTION_KINDS,
  DIRECTIONS,
  KEYS,
  plural,
  span,
} from './tables.ts';
import {
  classDefHover,
  covers,
  keywordHover,
  symbolHoverOf,
  trimmed,
} from '@mermaid-js/shared/parser/facet';

/** At most this many attributes are listed; the rest are counted. */
const LISTED = 8;

function entityHover(name: string, model: ErModel): string | undefined {
  const e = model.entities.find((x) => x.name === name);
  if (!e) return undefined;
  const head = `**entity** ${code(name)}${e.alias ? ` (alias ${code(e.alias)})` : ''}`;
  const parts = [head];
  if (e.attributes.length > 0) {
    const shown = e.attributes.slice(0, LISTED).map((a) => {
      const keys = a.keys.length > 0 ? ` ${a.keys.join(', ')}` : '';
      return code(`${a.type} ${a.name}${keys}`);
    });
    const more = e.attributes.length > LISTED ? `, … ${e.attributes.length - LISTED} more` : '';
    parts.push(`${plural(e.attributes.length, 'attribute')}: ${shown.join(', ')}${more}`);
  } else parts.push('No attributes.');
  const rels = model.relationships.filter((r) => r.from.name === name || r.to.name === name);
  const facts = [`${plural(rels.length, 'relationship')}`];
  if (e.classes.length > 0) {
    const cs = [...new Set(e.classes)];
    facts.push(`${cs.length === 1 ? 'Class' : 'Classes'}: ${cs.map(code).join(', ')}`);
  }
  parts.push(facts.join(' · '));
  return parts.join('\n\n');
}

function subgraphHover(name: string, model: ErModel): string | undefined {
  const s = model.subgraphs.find((x) => x.name === name);
  if (!s) return undefined;
  const dir = s.direction ? ` · Direction: ${code(s.direction)}` : '';
  return `**subgraph** ${code(name)}\n\nTitle: ${code(s.title)} · ${plural(s.members.length, 'member')}${dir}`;
}

function classHover(name: string, model: ErModel): string {
  const c = model.classes.find((x) => x.name === name);
  const used =
    name === 'default'
      ? 'Applies to every entity.'
      : `Used by ${plural(model.entities.filter((e) => e.classes.includes(name)).length, 'entity', 'entities')}`;
  return classDefHover('class', name, c?.styles, used);
}

function symbolHover(s: SymbolOccurrence, model: ErModel): string | undefined {
  switch (s.kind) {
    case 'entity':
    case 'subgraph':
      return subgraphHover(s.name, model) ?? entityHover(s.name, model);
    case 'class':
      return classHover(s.name, model);
    default:
      return undefined;
  }
}

/** The relationship whose cardinalities and line hold `at`. */
function relationshipAt(
  children: readonly ErStatementNode[],
  at: number
): ErRelationshipNode | undefined {
  for (const c of children) {
    if (c.type === 'Relationship' && c.relRange.start <= at && at <= c.relRange.end) return c;
    if (c.type === 'Subgraph') {
      const inner = relationshipAt(c.children, at);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** `A` (exactly one) to `B` (zero or more), identifying: `places`. */
function relationshipLine(node: ErRelationshipNode, model: ErModel): string | undefined {
  const r = model.relationships.find((x) => x.id === node.id);
  if (!r) return undefined;
  const end = (e: typeof r.from) => `${code(e.name)} (${CARDINALITY_MEANING[e.cardinality]})`;
  const label = r.label === '' ? '' : `: ${code(r.label)}`;
  return `${end(r.from)} to ${end(r.to)}, ${describeLine(r.identifying)}${label}`;
}

/** `direction LR` inside a direction token, which also holds the text before it on its line. */
function directionRange(text: string, r: Range): Range {
  const body = text.slice(r.start, r.end);
  const m = /direction\s+(?:TB|BT|RL|LR)/i.exec(body);
  return m ? span(r.start + m.index, r.start + m.index + m[0].length) : r;
}

export function erHover(at: HoverTarget, doc: DocumentView<ErDocument>): Hover | undefined {
  const { text, result } = doc;
  const model = result.model as ErModel;
  const symbol = symbolHoverOf(at, (s) => symbolHover(s, model));
  if (symbol) return symbol;
  const t = at.token;
  if (!t) return undefined;
  let range = trimmed(text, t.range);
  const dir = DIRECTION_KINDS[t.kind];
  if (dir !== undefined) range = directionRange(text, range);
  if (!covers(at.offset, range)) return undefined;
  const word = text.slice(range.start, range.end);
  if (dir !== undefined) {
    const meaning = DIRECTIONS.find(([d]) => d === dir)?.[1] ?? dir;
    return { range, contents: `**${code(word)}** direction: ${meaning}\n\n${erDocs[t.kind]}` };
  }
  const card = CARDINALITY_KINDS[t.kind];
  if (card !== undefined || t.kind === T.Identifying || t.kind === T.NonIdentifying) {
    const what =
      card !== undefined ? CARDINALITY_MEANING[card] : describeLine(t.kind === T.Identifying);
    const rel = relationshipAt(result.ast.children, at.offset);
    const line = rel && relationshipLine(rel, model);
    const docText = card !== undefined ? erDocs[T.ZeroOrOne] : erDocs[T.NonIdentifying];
    const body = [`**${code(word)}** ${what}`, ...(line ? [line] : []), docText ?? ''];
    return { range, contents: body.filter((p) => p !== '').join('\n\n') };
  }
  if (t.kind === T.AttributeKey) {
    const meaning = KEYS.find(([k]) => k === word.toUpperCase())?.[1] ?? 'key';
    return { range, contents: `**${code(word)}** ${meaning}\n\n${erDocs[T.AttributeKey]}` };
  }
  return keywordHover(text, at.offset, range, undefined, erDocs[t.kind]);
}
