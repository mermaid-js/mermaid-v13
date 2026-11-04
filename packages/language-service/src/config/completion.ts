/**
 * Front-matter completion (D96): keys and values of block-style front matter. Top level:
 * `title`, `displayMode`, `config`. Under `config`: the schema's keys, leaving out removed and
 * moved keys, the keys diagram text cannot set (core's secure list) and `look` (D153); a
 * diagram section only when it is the one the renderer reads for the detected type (every
 * section while no type is detected yet). Values: the key's enum, or `true`/`false`.
 * Inserted text follows the document's line ends and the line's indent (tabs or spaces).
 *
 * The cursor's place comes from the text, not the tree: a key being typed is not YAML yet.
 * The parent keys are found by one backward scan over the lines above (linear).
 */
import type { CompletionItem, Range } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from '../context.ts';
import { configSection, liveKeys, mapAt, secureKeys } from './front-matter.ts';
import type { FrontMatterTree } from './front-matter.ts';
import { FRONT_MATTER_KEYS } from './hover.ts';
import { SchemaView } from './schema.ts';
import type { SchemaNode } from './schema.ts';

const KEY_LINE = /^([ \t]*)([\w$-]*)$/;
const VALUE_LINE = /^([ \t]*)([\w$][\w$-]*)[ \t]*:[ \t]+([^\s#'"]*)$/;
/** A parent line: `key:` with nothing (or a comment) after it. */
const PARENT_LINE = /^([\w$][\w$-]*)[ \t]*:[ \t]*(?:#.*)?$/;

/** Where the line holding `offset` starts. */
function lineStartOf(text: string, offset: number, floor: number): number {
  return Math.max(floor, text.lastIndexOf('\n', offset - 1) + 1);
}

/** End of the run of characters matching `re` from `at` (stops at `limit`). */
function runEnd(text: string, at: number, limit: number, re: RegExp): number {
  let i = at;
  while (i < limit && re.test(text.charAt(i))) i++;
  return i;
}

/**
 * The keys of the block mappings that hold a line indented by `indent`, outermost first, or
 * `undefined` when the lines above do not nest block mappings down to it.
 */
function parentPath(
  text: string,
  fm: FrontMatterTree,
  lineStart: number,
  indent: number
): string[] | undefined {
  const base = fm.indent;
  if (indent < base) return undefined;
  const path: string[] = [];
  let threshold = indent;
  let end = lineStart;
  while (threshold > base && end > fm.yamlRange.start) {
    const start = lineStartOf(text, end - 1, fm.yamlRange.start);
    const line = text.slice(start, end).replace(/\r?\n$/, '');
    end = start;
    const content = line.trimStart();
    if (content === '' || content.startsWith('#')) continue;
    const ind = line.length - content.length;
    if (ind >= threshold) continue;
    const key = PARENT_LINE.exec(content.trimEnd());
    if (key === null) return undefined;
    path.unshift(key[1]!);
    threshold = ind;
  }
  return threshold <= base ? path : undefined;
}

/** A short type for the list: `string`, `boolean`, `object`, … */
function shortType(schema: SchemaView, node: SchemaNode): string {
  if (schema.shape(node) !== 'leaf') return 'object';
  const n = schema.resolve(node);
  return n.type === undefined ? 'any' : [n.type].flat().join(' | ');
}

/** A string as a YAML plain scalar when it reads back as itself, else single-quoted. */
function yamlString(s: string): string {
  const plain = /^[A-Za-z_][\w.-]*$/.test(s) && !/^(?:true|false|null|yes|no|on|off|y|n)$/i.test(s);
  return plain ? s : `'${s.replace(/'/g, "''")}'`;
}

/** Whether a root config key is offered: a diagram section only when it is the type's own. */
function offered(ctx: DocumentContext, schema: SchemaView, key: string): boolean {
  if (key === 'look' || secureKeys().has(key)) return false;
  if (!schema.isDiagramSection(key) || ctx.entry === undefined) return true;
  return key === configSection(ctx);
}

/** Whether a config path is somewhere completion offers nothing (`sequence.*` in a flowchart). */
function closedPath(ctx: DocumentContext, schema: SchemaView, path: readonly string[]): boolean {
  return (path.length > 0 && !offered(ctx, schema, path[0]!)) || path.includes('look');
}

/** The document's line end, and the indent one level below `indent`. */
function layout(text: string, fm: FrontMatterTree, indent: string): [string, string] {
  const eol = text.slice(fm.range.start, fm.range.end).includes('\r\n') ? '\r\n' : '\n';
  return [eol, indent + (indent.includes('\t') ? '\t' : '  ')];
}

function keyItems(
  ctx: DocumentContext,
  fm: FrontMatterTree,
  parent: readonly string[],
  range: Range,
  hasColon: boolean,
  indent: string
): CompletionItem[] {
  const [eol, inner] = layout(ctx.text, fm, indent);
  const insert = (key: string, object: boolean) => {
    if (hasColon) return key;
    return object ? `${key}:${eol}${inner}` : `${key}: `;
  };
  // Keys already in this mapping, other than the one being typed.
  const present = new Set(
    (mapAt(fm.root, parent)?.pairs ?? [])
      .filter((p) => p.keyRange.end < range.start || p.keyRange.start > range.end)
      .map((p) => p.key)
  );
  if (parent.length === 0) {
    return Object.entries(FRONT_MATTER_KEYS)
      .filter(([key]) => !present.has(key))
      .map(([key, doc]) => ({
        label: key,
        kind: 'property' as const,
        insertText: insert(key, key === 'config'),
        range,
        detail: key === 'config' ? 'object' : 'string',
        documentation: doc,
      }));
  }
  if (parent[0] !== 'config' || ctx.schema === undefined) return [];
  const schema = new SchemaView(ctx.schema);
  const path = parent.slice(1);
  if (closedPath(ctx, schema, path)) return [];
  const node = schema.at(path);
  if (node === undefined || schema.shape(node) !== 'closed') return [];
  const props = schema.properties(node);
  return liveKeys(props)
    .filter((key) => !present.has(key) && key !== 'look')
    .filter((key) => path.length > 0 || offered(ctx, schema, key))
    .map((key) => {
      const child = props.get(key)!;
      const description = schema.resolve(child).description?.trim();
      const item: CompletionItem = {
        label: key,
        kind: 'property',
        insertText: insert(key, schema.shape(child) !== 'leaf'),
        range,
        detail: shortType(schema, child),
      };
      return description === undefined ? item : { ...item, documentation: description };
    });
}

function valueItems(ctx: DocumentContext, path: readonly string[], range: Range): CompletionItem[] {
  if (ctx.schema === undefined) return [];
  const schema = new SchemaView(ctx.schema);
  const config = path.slice(1);
  let at: SchemaNode | undefined;
  // Top-level `displayMode` is `config.gantt.displayMode`: offered where gantt config is.
  if (path.length === 1 && path[0] === 'displayMode') {
    if (offered(ctx, schema, 'gantt')) at = schema.at(['gantt', 'displayMode']);
  } else if (path[0] === 'config' && config.length > 0 && !closedPath(ctx, schema, config))
    at = schema.at(config);
  if (at === undefined) return [];
  const node = schema.resolve(at);
  const docs = node['meta:enum'] ?? {};
  const types = node.type === undefined ? [] : [node.type].flat();
  const values = node.enum ?? (types.includes('boolean') ? [true, false] : []);
  return values.map((v) => {
    const text = typeof v === 'string' ? yamlString(v) : JSON.stringify(v);
    const doc = typeof v === 'string' && Object.hasOwn(docs, v) ? docs[v] : undefined;
    const item: CompletionItem = { label: text, kind: 'value', insertText: text, range };
    const withDetail = v === node.default ? { ...item, detail: 'default' } : item;
    return doc === undefined ? withDetail : { ...withDetail, documentation: doc };
  });
}

export function frontMatterCompletions(
  ctx: DocumentContext,
  fm: FrontMatterTree,
  offset: number
): CompletionItem[] {
  const { text } = ctx;
  const yaml = fm.yamlRange;
  if (offset < yaml.start || offset > yaml.end) return [];
  const lineStart = lineStartOf(text, offset, yaml.start);
  const lineEnd = runEnd(text, offset, yaml.end, /[^\r\n]/);
  const prefix = text.slice(lineStart, offset);

  const key = KEY_LINE.exec(prefix);
  if (key !== null) {
    const indent = key[1]!;
    const parent = parentPath(text, fm, lineStart, indent.length);
    if (parent === undefined) return [];
    const end = runEnd(text, offset, lineEnd, /[\w$-]/);
    const hasColon = /^[ \t]*:/.test(text.slice(end, lineEnd));
    return keyItems(ctx, fm, parent, { start: offset - key[2]!.length, end }, hasColon, indent);
  }
  const value = VALUE_LINE.exec(prefix);
  if (value !== null) {
    const parent = parentPath(text, fm, lineStart, value[1]!.length);
    if (parent === undefined) return [];
    const end = runEnd(text, offset, lineEnd, /[^\s#]/);
    return valueItems(ctx, [...parent, value[2]!], { start: offset - value[3]!.length, end });
  }
  return [];
}
