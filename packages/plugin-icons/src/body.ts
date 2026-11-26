/**
 * The icon body converter (D295, R-SEC-2): an Iconify body string, which may hold any SVG
 * markup, becomes `SvgFragment` nodes the writer replays through its allow-list. No markup is
 * passed through: a linear scanner reads the body, and only the shapes, groups and text below
 * are kept, each with checked presentation attributes.
 *
 * Dropped with everything inside them: `defs`, gradients, patterns, `mask`, `clipPath`,
 * `symbol`, `use`, `style`, `image`, `a`, `foreignObject`, scripts, animation and any other
 * element. A `url(…)` paint becomes `currentColor`. Each of these changes how the icon draws,
 * so the result reports it (`simplified`) for the caller's `ICON_SIMPLIFIED` warning. Comments,
 * `title`, `desc` and `metadata` draw nothing and are dropped without a report.
 */
import type { Attrs } from '@mermaid-js/core/svg';
import { entityAt, type SvgFragment } from '@mermaid-js/core/text';
import { readAttrs, type AttrReport } from './attrs.ts';

/** A converted body. */
export interface ConvertedBody {
  readonly nodes: readonly SvgFragment[];
  /** Something that draws was dropped or repainted: warn `ICON_SIMPLIFIED`. */
  readonly simplified: boolean;
}

type Tag = SvgFragment['tag'];

const SHAPES: ReadonlySet<string> = new Set([
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
]);
const TEXT_TAGS: ReadonlySet<string> = new Set(['text', 'tspan']);
/** Elements that draw nothing, dropped without a report. */
const SILENT: ReadonlySet<string> = new Set(['title', 'desc', 'metadata']);
/** Deeper elements are dropped, so a hostile body cannot nest without bound. */
const MAX_DEPTH = 32;
/** Past this many open elements the rest of the body is dropped, so scanning stays linear. */
const MAX_OPEN = 256;

const RE_NAME = /[A-Za-z_][\w:.-]*/y;
const RE_SPACE = /\s*/y;
const RE_ATTR_NAME = /[^\s=/>"']+/y;
const RE_UNQUOTED = /[^\s>]+/y;
// eslint-disable-next-line no-control-regex -- the characters XML does not allow
const RE_INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f￾￿]|[\ud800-\udfff]/gu;

interface Frame {
  readonly tag: string;
  /** Kept in the output; a frame inside a dropped one is never kept. */
  readonly keep: boolean;
  readonly attrs: Attrs;
  readonly children: (SvgFragment | string)[];
}

/**
 * Character references decoded as XML decodes them (core's `entityAt` with `xml`): each needs
 * its `;`, and a name is read whole. Unknown ones stay.
 */
function decode(text: string): string {
  let out = '';
  let from = 0;
  for (let at = text.indexOf('&'); at !== -1; at = text.indexOf('&', at + 1)) {
    const ref = entityAt(text, at, true);
    if (ref === undefined) continue;
    out += text.slice(from, at) + ref[0];
    from = at + ref[1];
    at = from - 1;
  }
  return (out + text.slice(from)).replace(RE_INVALID, '');
}

function sticky(re: RegExp, s: string, at: number): string | undefined {
  re.lastIndex = at;
  return re.exec(s)?.[0];
}

/** The scanner's state over one body. */
class Scan {
  pos = 0;
  simplified = false;
  readonly root: Frame = { tag: '', keep: true, attrs: {}, children: [] };
  readonly stack: Frame[] = [this.root];
  constructor(private readonly src: string) {}

  run(): SvgFragment[] {
    const src = this.src;
    while (this.pos < src.length) {
      const lt = src.indexOf('<', this.pos);
      const end = lt === -1 ? src.length : lt;
      if (end > this.pos) this.text(decode(src.slice(this.pos, end)));
      if (lt === -1) break;
      this.pos = lt;
      if (!this.markup()) {
        // The body ends inside a tag, comment or CDATA section: the rest is lost.
        this.simplified = true;
        break;
      }
    }
    while (this.stack.length > 1) this.pop();
    return this.root.children as SvgFragment[];
  }

  private get top(): Frame {
    return this.stack[this.stack.length - 1] as Frame;
  }

  /** Character data: kept only directly inside a kept `text` or `tspan`. */
  private text(content: string): void {
    const top = this.top;
    if (!top.keep || !TEXT_TAGS.has(top.tag) || content === '') return;
    const last = top.children.length - 1;
    if (typeof top.children[last] === 'string') top.children[last] += content;
    else top.children.push(content);
  }

  /** Skips past `close` from the current position; false when the body ends first. */
  private skipTo(close: string, from: number): boolean {
    const at = this.src.indexOf(close, from);
    if (at === -1) return false;
    this.pos = at + close.length;
    return true;
  }

  /** One construct starting at `<`. False when the body ends inside it. */
  private markup(): boolean {
    const src = this.src;
    const at = this.pos;
    if (src.startsWith('<!--', at)) return this.skipTo('-->', at + 4);
    if (src.startsWith('<![CDATA[', at)) {
      const end = src.indexOf(']]>', at + 9);
      if (end === -1) return false;
      this.text(src.slice(at + 9, end).replace(RE_INVALID, ''));
      this.pos = end + 3;
      return true;
    }
    if (src.startsWith('<!', at) || src.startsWith('<?', at)) return this.skipTo('>', at + 2);
    if (src.startsWith('</', at)) return this.closing(at + 2);
    const name = sticky(RE_NAME, src, at + 1);
    if (name === undefined) {
      this.text('<');
      this.pos = at + 1;
      return true;
    }
    return this.opening(name, at + 1 + name.length);
  }

  private closing(from: number): boolean {
    const name = sticky(RE_NAME, this.src, from) ?? '';
    if (!this.skipTo('>', from)) return false;
    let i = this.stack.length - 1;
    while (i > 0 && (this.stack[i] as Frame).tag !== name) i--;
    if (i > 0) while (this.stack.length > i) this.pop();
    return true;
  }

  private opening(tag: string, from: number): boolean {
    const raw = this.attributes(from);
    if (raw === undefined) return false;
    if (this.stack.length > MAX_OPEN) {
      this.simplified = true;
      return false;
    }
    const parent = this.top;
    const report: AttrReport = { simplified: false, hidden: false };
    const allowed =
      parent.keep &&
      this.stack.length <= MAX_DEPTH &&
      (TEXT_TAGS.has(parent.tag) ? tag === 'tspan' : SHAPES.has(tag));
    const attrs = allowed ? readAttrs(raw.attrs, report) : {};
    const keep = allowed && !report.hidden;
    if (keep) this.simplified ||= report.simplified;
    else if (parent.keep && !report.hidden && !SILENT.has(tag)) this.simplified = true;
    this.stack.push({ tag, keep, attrs, children: [] });
    if (raw.selfClosing) this.pop();
    return true;
  }

  /** An element's attributes, first of each name; the position ends after the tag. */
  private attributes(
    from: number
  ): { attrs: Map<string, string>; selfClosing: boolean } | undefined {
    const src = this.src;
    const attrs = new Map<string, string>();
    let i = from;
    for (;;) {
      i += (sticky(RE_SPACE, src, i) ?? '').length;
      if (i >= src.length) return undefined;
      if (src[i] === '>' || src.startsWith('/>', i)) {
        this.pos = i + (src[i] === '>' ? 1 : 2);
        return { attrs, selfClosing: src[i] === '/' };
      }
      const name = sticky(RE_ATTR_NAME, src, i);
      if (name === undefined) {
        i++;
        continue;
      }
      i += name.length;
      i += (sticky(RE_SPACE, src, i) ?? '').length;
      let value = '';
      if (src[i] === '=') {
        i += 1 + (sticky(RE_SPACE, src, i + 1) ?? '').length;
        const quote = src[i];
        if (quote === '"' || quote === "'") {
          const end = src.indexOf(quote, i + 1);
          if (end === -1) return undefined;
          value = src.slice(i + 1, end);
          i = end + 1;
        } else {
          value = sticky(RE_UNQUOTED, src, i) ?? '';
          i += value.length;
        }
      }
      if (!attrs.has(name)) attrs.set(name, decode(value));
    }
  }

  /** Closes the top element, adding it to its parent when it is kept. */
  private pop(): void {
    const frame = this.stack.pop() as Frame;
    if (!frame.keep) return;
    const node: SvgFragment =
      frame.children.length > 0
        ? { tag: frame.tag as Tag, attrs: frame.attrs, children: frame.children }
        : { tag: frame.tag as Tag, attrs: frame.attrs };
    this.top.children.push(node);
  }
}

/** An icon body as allow-listed nodes, and whether converting it changed how it draws. */
export function convertBody(body: string): ConvertedBody {
  const scan = new Scan(body);
  const nodes = scan.run();
  return { nodes, simplified: scan.simplified };
}
