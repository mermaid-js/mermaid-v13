/**
 * Front-matter completion (D96): keys and values of front matter in block or flow style, with
 * plain or quoted keys (#169). Top level:
 * `title`, `displayMode`, `config`. Under `config`: the schema's keys, leaving out removed and
 * moved keys, the keys diagram text cannot set (core's secure list) and `look` (D153); a
 * diagram section only when it is the one the renderer reads for the detected type (every
 * section while no type is detected yet). Values: the key's enum, or `true`/`false`.
 * Inserted text follows the document's line ends and the line's indent (tabs or spaces); in
 * flow style a key is inserted as `key: `, and a quoted key as its name only.
 *
 * The cursor's place comes from the text, not the tree: a key being typed is not YAML yet.
 * One forward scan over the lines before the cursor finds the flow collections (`{…}`, `[…]`)
 * and skips those that close before it; inside one, the scan of it gives the keys on the way.
 * In block style the parent keys come from one backward scan over the lines above. Both are
 * linear.
 */
import { lineEnd } from '@mermaid-js/core/parser-kit';
import type { CompletionItem, Range } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from '../context.ts';
import { configSection, liveKeys, mapAt, secureKeys } from './front-matter.ts';
import type { FrontMatterTree } from './front-matter.ts';
import { FRONT_MATTER_KEYS } from './hover.ts';
import { SchemaView } from './schema.ts';
import type { SchemaNode } from './schema.ts';

/** A key as completion reads it: plain, or a `"…"` or `'…'` key whose text is a plain key. */
const KEY = String.raw`(?:([\w$][\w$-]*)|"([\w$-]+)"|'([\w$-]+)')`;
/** A key being typed: indent, an opening quote if any, the text so far. */
const KEY_LINE = /^([ \t]*)(["']?)([\w$-]*)$/;
const VALUE_LINE = new RegExp(String.raw`^([ \t]*)${KEY}[ \t]*:[ \t]+([^\s#'"]*)$`);
/** A parent line: `key:` with nothing (or a comment) after it. */
const PARENT_LINE = new RegExp(String.raw`^${KEY}[ \t]*:[ \t]*(?:#.*)?$`);
/** A line that opens a flow collection: `key: {`, `- [`, or a bare `{` (a root document). */
const FLOW_LINE = new RegExp(String.raw`^([ \t]*)(?:${KEY}[ \t]*:[ \t]+|(-[ \t]+))?[{[]`);
const PLAIN_KEY = /[\w$-]/;
/** Characters of a plain value inside a flow collection, as far as completion goes. */
const FLOW_VALUE = /[^\s,[\]{}#'"]/;
const FLOW_BLANK = /[\s,[\]{}]/;

/** The key a {@link KEY} match names, from its first group at `at`. */
function keyOf(m: RegExpExecArray, at: number): string {
  return (m[at] ?? m[at + 1] ?? m[at + 2])!;
}

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
    path.unshift(keyOf(key, 1));
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

/**
 * How a key is inserted: its name only (`name`: a `:` follows, or the key is quoted), `key: `
 * (`flow`), or in block style `key: ` for a leaf and `key:` plus an indented new line for a
 * mapping (`block`).
 */
type KeyInsert = 'name' | 'flow' | 'block';

function keyItems(
  ctx: DocumentContext,
  fm: FrontMatterTree,
  parent: readonly string[],
  range: Range,
  style: KeyInsert,
  indent: string
): CompletionItem[] {
  const [eol, inner] = layout(ctx.text, fm, indent);
  const insert = (key: string, object: boolean) => {
    if (style === 'name') return key;
    return object && style === 'block' ? `${key}:${eol}${inner}` : `${key}: `;
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

/** The cursor inside a flow collection: a key or a value being typed. */
interface FlowPlace {
  kind: 'key' | 'value';
  /** A key's mapping path, or a value's key path. */
  path: string[];
  range: Range;
  /** A key typed inside quotes: inserted as its name only. */
  quoted: boolean;
}

/** One open flow collection of a scan. */
interface Frame {
  map: boolean;
  /** Keys from the root to this collection; `undefined` inside a sequence (nothing offered). */
  path: string[] | undefined;
  /** Map: the key of the entry being read, once read. */
  key?: string;
  /** Map: the entry's `:` was read. */
  value: boolean;
  /** The entry's value was read (only a `,` or the closing bracket can follow). */
  done: boolean;
}

/** The offset after a quoted value opening at `at` (or `limit` when it is never closed). */
function quotedEnd(text: string, at: number, limit: number): number {
  const q = text.charAt(at);
  for (let i = at + 1; i < limit; i++) {
    const c = text.charAt(i);
    if (q === '"' && c === '\\') i++;
    else if (c === q && q === "'" && text.charAt(i + 1) === q) i++;
    else if (c === q) return i + 1;
  }
  return limit;
}

/** The place at `range` in `frame`, or `null` when nothing is offered there. */
function placeIn(frame: Frame, range: Range, quoted: boolean): FlowPlace | null {
  if (frame.path === undefined || !frame.map || frame.done) return null;
  if (!frame.value) return { kind: 'key', path: frame.path, range, quoted };
  if (frame.key === undefined || quoted) return null;
  return { kind: 'value', path: [...frame.path, frame.key], range, quoted };
}

/**
 * A scan of the flow collection opening at `open`, whose keys from the root are `path`, up to
 * `limit`, for the cursor at `offset`. Each step reads one token at `i`, and returns the
 * cursor's place (`null`: nothing is offered there) once the token holds the cursor.
 */
class FlowScan {
  private readonly stack: Frame[] = [];
  private i: number;

  constructor(
    private readonly text: string,
    open: number,
    private readonly path: string[] | undefined,
    private readonly offset: number,
    private readonly limit: number
  ) {
    this.i = open;
  }

  /** The cursor's place when it is inside the collection, else the offset after it. */
  run(): FlowPlace | null | number {
    const { text, offset } = this;
    while (this.i < this.limit) {
      const c = text.charAt(this.i);
      const top = this.stack.at(-1);
      if (c === '{' || c === '[') {
        // The cursor right before a bracket is between tokens, as before a `,`.
        if (top !== undefined && this.i === offset) return placeIn(top, this.here(), false);
        this.open(c, top);
        continue;
      }
      if (top === undefined) return this.i;
      if (this.i === offset && (FLOW_BLANK.test(c) || c === ':' || c === '#'))
        return placeIn(top, this.here(), false);
      const r = this.step(c, top);
      if (r !== undefined) return r;
      if (this.stack.length === 0) return this.i;
    }
    const top = this.stack.at(-1);
    return top === undefined ? this.i : placeIn(top, this.here(), false);
  }

  private here(): Range {
    return { start: this.offset, end: this.offset };
  }

  /** A nested collection: its path goes through the key whose value it is. */
  private open(c: string, top: Frame | undefined): void {
    let inner = this.path;
    if (top !== undefined) {
      const keyed = top.map && top.value && top.key !== undefined && top.path !== undefined;
      inner = keyed ? [...top.path!, top.key!] : undefined;
      top.done = true;
    }
    this.stack.push({ map: c === '{', path: inner, value: false, done: false });
    this.i++;
  }

  /** One token other than an opening bracket; the place when it holds the cursor. */
  private step(c: string, top: Frame): FlowPlace | null | undefined {
    const { text } = this;
    if (c === '}' || c === ']') {
      this.stack.pop();
      this.i++;
    } else if (c === ',') {
      top.key = undefined;
      top.value = false;
      top.done = false;
      this.i++;
    } else if (/\s/.test(c)) {
      this.i++;
    } else if (c === '#' && /\s/.test(text.charAt(this.i - 1))) {
      const end = Math.min(lineEnd(text, this.i), this.limit);
      if (this.offset > this.i && this.offset <= end) return null;
      this.i = end;
    } else if (c === ':' && top.map && !top.value) {
      top.value = true;
      this.i++;
    } else if (c === '"' || c === "'") {
      return this.quoted(c, top);
    } else {
      return this.plain(top);
    }
    return undefined;
  }

  /** A quoted scalar; the cursor inside the quotes types a key. */
  private quoted(q: string, top: Frame): FlowPlace | null | undefined {
    const { text, offset } = this;
    const at = this.i;
    const end = quotedEnd(text, at, this.limit);
    const closed = end > at + 1 && text.charAt(end - 1) === q;
    if (offset > at && (offset < end || !closed)) {
      if (!/^[\w$-]*$/.test(text.slice(at + 1, offset))) return null;
      return placeIn(
        top,
        { start: at + 1, end: runEnd(text, offset, this.limit, PLAIN_KEY) },
        true
      );
    }
    if (top.map && !top.value) top.key = text.slice(at + 1, end - 1);
    else top.done = true;
    this.i = end;
    return undefined;
  }

  /** A plain scalar: to a flow indicator, the line end, `: ` after a key, or ` #`. */
  private plain(top: Frame): FlowPlace | null | undefined {
    const { text, offset } = this;
    const start = this.i;
    const inKey = top.map && !top.value;
    let i = start;
    while (i < this.limit) {
      const d = text.charAt(i);
      if (',[]{}\r\n'.includes(d)) break;
      if (d === ':' && inKey && FLOW_BLANK.test(text.charAt(i + 1) || ' ')) break;
      if (d === '#' && /\s/.test(text.charAt(i - 1))) break;
      i++;
    }
    this.i = i;
    if (offset >= start && offset <= i) {
      const re = inKey ? PLAIN_KEY : FLOW_VALUE;
      for (let k = start; k < offset; k++) if (!re.test(text.charAt(k))) return null;
      return placeIn(top, { start, end: runEnd(text, offset, this.limit, re) }, false);
    }
    if (inKey) top.key = text.slice(start, i).trim();
    else top.done = true;
    return undefined;
  }
}

/**
 * The cursor's place when it is inside a flow collection, from one forward scan over the lines
 * before it that skips the collections closing before it. `undefined` when it is not inside one
 * (block style), `null` when it is but nothing is offered there.
 */
function flowPlace(
  text: string,
  fm: FrontMatterTree,
  offset: number
): FlowPlace | null | undefined {
  const yaml = fm.yamlRange;
  let lineStart = yaml.start;
  let first = true;
  while (lineStart < yaml.end && lineStart <= offset) {
    const end = runEnd(text, lineStart, yaml.end, /[^\r\n]/);
    const line = text.slice(lineStart, end);
    let next = end;
    const m = FLOW_LINE.exec(line);
    if (m !== null) {
      const open = lineStart + m[0].length - 1;
      const indent = m[1]!.length;
      // The keys on the way: `key: {` under its block parents, none for `- {`, a root `{`.
      let path: string[] | undefined | false = false;
      if (m[2] !== undefined || m[3] !== undefined || m[4] !== undefined) {
        const parent = parentPath(text, fm, lineStart, indent);
        path = parent === undefined ? undefined : [...parent, keyOf(m, 2)];
      } else if (m[5] !== undefined) path = undefined;
      else if (first && indent === fm.indent) path = [];
      if (path !== false && open < offset) {
        const r = new FlowScan(text, open, path, offset, yaml.end).run();
        if (typeof r !== 'number') return r;
        next = r;
      }
    }
    if (line.trim() !== '' && !line.trimStart().startsWith('#')) first = false;
    const e = runEnd(text, next, yaml.end, /[^\r\n]/);
    if (e >= yaml.end) break;
    lineStart = e + (text.startsWith('\r\n', e) ? 2 : 1);
  }
  return undefined;
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
  const cursorLineEnd = runEnd(text, offset, yaml.end, /[^\r\n]/);
  const prefix = text.slice(lineStart, offset);

  const flow = flowPlace(text, fm, offset);
  if (flow === null) return [];
  if (flow !== undefined) {
    if (flow.kind === 'value') return valueItems(ctx, flow.path, flow.range);
    const colon = /^[ \t]*:/.test(text.slice(flow.range.end, cursorLineEnd));
    return keyItems(ctx, fm, flow.path, flow.range, flow.quoted || colon ? 'name' : 'flow', '');
  }

  const key = KEY_LINE.exec(prefix);
  if (key !== null) {
    const indent = key[1]!;
    const parent = parentPath(text, fm, lineStart, indent.length);
    if (parent === undefined) return [];
    const end = runEnd(text, offset, cursorLineEnd, PLAIN_KEY);
    const colon = /^[ \t]*:/.test(text.slice(end, cursorLineEnd));
    const style = key[2] !== '' || colon ? 'name' : 'block';
    return keyItems(ctx, fm, parent, { start: offset - key[3]!.length, end }, style, indent);
  }
  const value = VALUE_LINE.exec(prefix);
  if (value !== null) {
    const parent = parentPath(text, fm, lineStart, value[1]!.length);
    if (parent === undefined) return [];
    const end = runEnd(text, offset, cursorLineEnd, /[^\s#]/);
    const range = { start: offset - value[5]!.length, end };
    return valueItems(ctx, [...parent, keyOf(value, 2)], range);
  }
  return [];
}
