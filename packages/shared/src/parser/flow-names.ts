/**
 * The flow family's check of a new node id, class name or edge id (rename, D92): the name is
 * written into a probe text of the dialect and must read back as exactly that symbol.
 */
import type { ParseResult, Range } from '@mermaid-js/core/parser-kit';
import { readsBack, shapeReason } from './facet.ts';

/**
 * Why `name` cannot be a class name or an edge id (`kind`) in the dialect whose texts start
 * with `header` (its header line, line break included) and are read by `parse`, or `undefined`
 * when it can.
 */
function flowNameReason(
  name: string,
  kind: 'class' | 'edge',
  header: string,
  parse: (text: string) => Pick<ParseResult<unknown>, 'diagnostics' | 'symbols'>
): string | undefined {
  const before = kind === 'class' ? 'classDef ' : 'A ';
  const text =
    kind === 'class' ? `${header}classDef ${name} fill:#000\n` : `${header}A ${name}@--> B\n`;
  return (
    shapeReason(name, 'An id') ??
    (readsBack(parse(text), header.length + before.length, name, kind)
      ? undefined
      : `'${name}' is not ${kind === 'class' ? 'a class name' : 'an edge id'}.`)
  );
}

/** What the node id check needs of a flow dialect (flowchart, agentflow). */
export interface FlowIdDialect {
  /** The probe texts' header line, line break included. */
  readonly header: string;
  /** The dialect's token view of a text. */
  readonly tokens: (text: string) => readonly { readonly kind: number; readonly range: Range }[];
  readonly parse: (text: string) => Pick<ParseResult<unknown>, 'diagnostics' | 'symbols'>;
  /** The arrow token kinds: a name holding one is not an id. */
  readonly links: ReadonlySet<number>;
  /** The keyword token kinds: a name that is one is not an id. */
  readonly keywords: ReadonlySet<number>;
  /** Why the dialect keeps `name` back, checked after the name's shape, if it does. */
  readonly reserved?: (name: string) => string | undefined;
}

/**
 * Why `name` cannot be a node id of the dialect, or `undefined` when it can: the parser must
 * read `name` alone on a line as one node whose id is exactly `name`.
 */
function flowIdReason(name: string, dialect: FlowIdDialect): string | undefined {
  const reason = shapeReason(name, 'An id') ?? dialect.reserved?.(name);
  if (reason) return reason;
  const { header } = dialect;
  const text = `${header}${name}\n`;
  // Tokens that start inside the name (`end` takes its line break with it).
  const tokens = dialect
    .tokens(text)
    .filter((t) => t.range.start >= header.length && t.range.start < header.length + name.length);
  if (tokens.some((t) => dialect.links.has(t.kind))) return `'${name}' contains an arrow.`;
  if (tokens.length === 1 && dialect.keywords.has(tokens[0]!.kind))
    return `'${name}' is a keyword.`;
  return readsBack(dialect.parse(text), header.length, name, 'node')
    ? undefined
    : `'${name}' is not a node id.`;
}

/**
 * A flow dialect's `isValidId` (D92): why `name` cannot be a symbol of `kind` (`node` or
 * `subgraph`, `class`, `edge`), if it cannot. A subgraph id is checked as a node id: edges and
 * `style` name it as one.
 */
export function flowIdCheck(
  dialect: FlowIdDialect
): (name: string, kind?: string) => string | undefined {
  return (name, kind = 'node') =>
    kind === 'class' || kind === 'edge'
      ? flowNameReason(name, kind, dialect.header, dialect.parse)
      : flowIdReason(name, dialect);
}
