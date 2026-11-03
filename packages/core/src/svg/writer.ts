/**
 * The typed SVG writer (DESIGN §7.1, ADR-3): the only way to produce markup. One API,
 * two backings with byte-identical output: streaming into a string (default) and the
 * compact tree used when a `postRender` hook is registered.
 */
import { BLANK_REL, TEXT_HOLDERS } from './allowlist.ts';
import { checkTag, formatValue } from './encode.ts';
import { esc } from './escape.ts';
import { pathBuilder, type PathBuilder } from './path.ts';
import { CompactTree, type SvgTree } from './tree.ts';
import type { AllowedTag, Attrs, ThemeStyleSheet } from './types.ts';

/** One run of text with uniform emphasis. */
export interface LabelSpan {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  /** Extra checked attributes for this span's `<tspan>` (for example a theme font). */
  readonly attrs?: Attrs;
}

/**
 * A measured label, as the label layout produces it. Lines are drawn centred on a point;
 * `baseline` is the distance from the top of a line box to its baseline (from the
 * measurer's ascent/descent), so no font-size heuristic is needed here.
 */
export interface LabelBox {
  readonly lines: readonly (readonly LabelSpan[])[];
  /** Height of one line box. */
  readonly lineHeight: number;
  /** Height of the whole label (normally `lines.length * lineHeight`). */
  readonly height: number;
  /** Distance from the top of a line box to its baseline. */
  readonly baseline: number;
  /**
   * Draw the lines left-aligned as one block (bullet lists): each line starts `indents[i]` from
   * the left edge of a box `width` wide centred on the point. Needs `width`.
   */
  readonly left?: boolean;
  /** Width of the widest line, its indent included. */
  readonly width?: number;
  /** Offset of each line from the left edge of the box. */
  readonly indents?: readonly number[];
}

export interface SvgWriter {
  open(tag: AllowedTag, attrs?: Attrs): void;
  close(): void;
  leaf(tag: AllowedTag, attrs?: Attrs): void;
  /** Character data, always escaped. Only `text`, `tspan`, `title` and `desc` hold text. */
  text(content: string): void;
  /** A measured label centred on (x, y), as `<text>`/`<tspan>`. */
  label(box: LabelBox, x: number, y: number, attrs?: Attrs): void;
  /** A builder for `d` values; numbers are formatted to two decimals. */
  path(): PathBuilder;
  /**
   * The `theme: 'auto'` style sheet, as a `<style>` child of the root `<svg>` (R-THEME-8).
   * `assertInert` accepts it only with `themeStyle: true`.
   */
  styleSheet(css: ThemeStyleSheet): void;
}

function checkSheetParent(top: string | undefined, depth: number): void {
  if (top !== 'svg' || depth !== 1)
    throw new TypeError('A theme style sheet must be a child of the root <svg>');
}

export interface StreamSvgWriter extends SvgWriter {
  /** The markup written so far. Throws if an element is still open. */
  finish(): string;
}

export interface TreeSvgWriter extends SvgWriter {
  /** The tree the writer has built, for `postRender` hooks to edit. */
  readonly tree: SvgTree;
  /** Serialises the (possibly edited) tree. Throws if an element is still open. */
  finish(): string;
}

function textDecoration(span: LabelSpan): Attrs['text-decoration'] {
  if (span.underline) return 'underline';
  return span.strike ? 'line-through' : span.attrs?.['text-decoration'];
}

function spanAttrs(span: LabelSpan, pos: Attrs | undefined): Attrs | undefined {
  if (!span.bold && !span.italic && !span.underline && !span.strike && !span.attrs) return pos;
  return {
    ...pos,
    ...span.attrs,
    'font-weight': span.bold ? 'bold' : span.attrs?.['font-weight'],
    'font-style': span.italic ? 'italic' : span.attrs?.['font-style'],
    'text-decoration': textDecoration(span),
  };
}

// Written through the primitives, so both backings agree by construction.
function writeLabel(
  w: SvgWriter,
  box: LabelBox,
  cx: number,
  cy: number,
  attrs: Attrs | undefined
): void {
  const lines = box.lines;
  if (lines.length === 0) return;
  const top = cy - box.height / 2;
  const first = lines[0];
  const only = lines.length === 1 && first && first.length === 1 ? first[0] : undefined;
  if (only && spanAttrs(only, undefined) === undefined) {
    w.open('text', { ...attrs, x: cx, y: top + box.baseline, 'text-anchor': 'middle' });
    w.text(only.text);
    w.close();
    return;
  }
  const left = box.left === true && box.width !== undefined ? cx - box.width / 2 : undefined;
  w.open('text', {
    ...attrs,
    'text-anchor': left === undefined ? 'middle' : 'start',
    'xml:space': 'preserve',
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as readonly LabelSpan[];
    const y = top + i * box.lineHeight + box.baseline;
    const x = left === undefined ? cx : left + (box.indents?.[i] ?? 0);
    if (line.length === 0) {
      w.open('tspan', { x, y });
      w.text(' ');
      w.close();
      continue;
    }
    for (let j = 0; j < line.length; j++) {
      const span = line[j] as LabelSpan;
      w.open('tspan', spanAttrs(span, j === 0 ? { x, y } : undefined));
      w.text(span.text);
      w.close();
    }
  }
  w.close();
}

class Stream implements StreamSvgWriter {
  private out = '';
  private readonly stack: string[] = [];
  private pending = false;

  private attrs(tag: string, attrs: Attrs | undefined): string {
    if (!attrs) return '';
    let s = '';
    const blank = tag === 'a' && attrs.target === '_blank';
    let rel = false;
    for (const name in attrs) {
      const raw = (attrs as Record<string, unknown>)[name];
      let value = formatValue(tag, name, raw);
      if (value === undefined) continue;
      if (name === 'rel' && blank) {
        value = BLANK_REL;
        rel = true;
      }
      // Numbers and number lists format to digits, signs, points, commas and spaces only.
      const plain = typeof raw === 'number' || Array.isArray(raw);
      s += ' ' + name + '="' + (plain ? value : esc(value)) + '"';
    }
    if (blank && !rel) s += ' rel="' + BLANK_REL + '"';
    return s;
  }

  private flush(): void {
    if (this.pending) {
      this.out += '>';
      this.pending = false;
    }
  }

  open(tag: AllowedTag, attrs?: Attrs): void {
    checkTag(tag);
    const a = this.attrs(tag, attrs);
    this.flush();
    this.out += '<' + tag + a;
    this.pending = true;
    this.stack.push(tag);
  }

  close(): void {
    const tag = this.stack.pop();
    if (tag === undefined) throw new Error('SvgWriter.close() without a matching open()');
    if (this.pending) {
      this.out += '/>';
      this.pending = false;
    } else {
      this.out += '</' + tag + '>';
    }
  }

  leaf(tag: AllowedTag, attrs?: Attrs): void {
    checkTag(tag);
    const a = this.attrs(tag, attrs);
    this.flush();
    this.out += '<' + tag + a + '/>';
  }

  text(content: string): void {
    const top = this.stack[this.stack.length - 1];
    if (top === undefined || !TEXT_HOLDERS.has(top))
      throw new TypeError(`<${top ?? 'document'}> cannot hold text`);
    const e = esc(content);
    if (e === '') return;
    this.flush();
    this.out += e;
  }

  label(box: LabelBox, x: number, y: number, attrs?: Attrs): void {
    writeLabel(this, box, x, y, attrs);
  }

  path(): PathBuilder {
    return pathBuilder();
  }

  styleSheet(css: ThemeStyleSheet): void {
    checkSheetParent(this.stack[this.stack.length - 1], this.stack.length);
    this.flush();
    this.out += '<style>' + esc(css) + '</style>';
  }

  finish(): string {
    if (this.stack.length > 0)
      throw new Error(`SvgWriter.finish() with <${this.stack[this.stack.length - 1]}> still open`);
    return this.out;
  }
}

class Tree implements TreeSvgWriter {
  private readonly compact = new CompactTree();
  private readonly stack: number[] = [0];

  get tree(): SvgTree {
    return this.compact;
  }

  private get current(): number {
    return this.stack[this.stack.length - 1] as number;
  }

  open(tag: AllowedTag, attrs?: Attrs): void {
    this.stack.push(this.compact.appendElement(this.current, tag, attrs));
  }

  close(): void {
    if (this.stack.length === 1) throw new Error('SvgWriter.close() without a matching open()');
    this.stack.pop();
  }

  leaf(tag: AllowedTag, attrs?: Attrs): void {
    this.compact.appendElement(this.current, tag, attrs);
  }

  text(content: string): void {
    this.compact.appendTextNode(this.current, content);
  }

  label(box: LabelBox, x: number, y: number, attrs?: Attrs): void {
    writeLabel(this, box, x, y, attrs);
  }

  path(): PathBuilder {
    return pathBuilder();
  }

  styleSheet(css: ThemeStyleSheet): void {
    checkSheetParent(this.compact.tagOf(this.current), this.stack.length - 1);
    this.compact.appendStyleSheet(this.current, css);
  }

  finish(): string {
    if (this.stack.length > 1) throw new Error('SvgWriter.finish() with an element still open');
    return this.compact.serialize();
  }
}

/** The default backing: writes straight into a string buffer. */
export function streamWriter(): StreamSvgWriter {
  return new Stream();
}

/** The tree backing, for when a `postRender` hook is registered. */
export function treeWriter(): TreeSvgWriter {
  return new Tree();
}
