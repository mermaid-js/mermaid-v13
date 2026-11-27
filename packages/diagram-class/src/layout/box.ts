// Class box measurement (spec #126 T3): the stack v12's `classBox` drew (rendering-elements/
// shapes/classBox.ts and class/shapeUtil.ts at fa796a943), measured before layout with the
// injected measurer. The geometry is v13's own, documented here, so the renderer (#156) only
// draws what these rows and dividers say.
import type { AstId } from '@mermaid-js/core/parser-kit';
import {
  layoutLabel,
  Style,
  type FontKey,
  type InlineSpans,
  type LabelSource,
  type MeasuredLabel,
  type Measurer,
  type StyleBits,
} from '@mermaid-js/core/text';
import type { ClassMember, ClassNode } from '../parser/model.ts';
import { memberLabel } from '../parser/member.ts';

/**
 * Reads one label of a class box as written, with core's label handler (#1368): `markdown`
 * when the parser marked it as a markdown string and gives it without its backticks. Every
 * label of a box is of a kind v12 read markdown in (`v12Markdown`).
 */
export type ReadLabel = (label: string, markdown?: boolean) => LabelSource;

/** One line of text in a class box. */
export interface ClassRow {
  /**
   * The source text, before markdown is read: `«interface»`, `Animal&lt;T&gt;`,
   * `+eat(food) : bool`. A generic's brackets are character references here (D619).
   */
  readonly text: string;
  readonly label: MeasuredLabel;
  /**
   * Where the row is drawn, from the box's top-left corner: `y` is the top of the label box;
   * `x` is the label's centre (`anchor: 'middle'`) or its left edge (`anchor: 'start'`).
   */
  readonly x: number;
  readonly y: number;
  readonly anchor: 'middle' | 'start';
  /** Style bits it was measured with: bold name, italic `*`, underlined `$`. */
  readonly style: StyleBits;
  /** The member it shows (attribute and method rows). */
  readonly member?: ClassMember;
  /** `m:<class>#<k>` for member rows. */
  readonly ast?: AstId;
}

/** The attributes or the methods part of a box, between dividers. */
export interface ClassCompartment {
  readonly kind: 'attributes' | 'methods';
  /** From the box's top edge. */
  readonly top: number;
  readonly height: number;
  /** Empty for a compartment drawn with nothing in it. */
  readonly rows: readonly ClassRow[];
}

/** The measured box of one class. */
export interface ClassBoxGeometry {
  readonly width: number;
  readonly height: number;
  /** `«name»` above the name, for the first annotation (v12 drew only the first). */
  readonly annotation?: ClassRow;
  /** The class name, bold, with its generic type: `Name&lt;T&gt;`, drawn `Name<T>`. */
  readonly name: ClassRow;
  /** None (`hideEmptyMembersBox` with no members), or attributes then methods. */
  readonly compartments: readonly ClassCompartment[];
  /** y of each divider line from the box's top edge: one above each compartment. */
  readonly dividers: readonly number[];
}

/** Lengths a box is measured with, already in the profile's units. */
export interface BoxMetrics {
  /** Room around each part of the box, across (`x`) and down (`y`): `class.padding` (v12 12). */
  readonly pad: { readonly x: number; readonly y: number };
  /** Room between two member rows (v12's 3 px for SVG labels). */
  readonly rowGap: number;
  /** Drop both compartments of a class with no members (`class.hideEmptyMembersBox`). */
  readonly hideEmpty: boolean;
}

const CLASSIFIER_STYLE: Readonly<Record<string, StyleBits>> = {
  '': 0,
  '*': Style.Italic,
  $: Style.Underline,
};

/**
 * The name row's text as the label layout reads it: the label, then `&lt;type&gt;` for a
 * generic class (v12 `ClassNode.text`), so `B~U~` draws `B<U>`, not `B` underlined (D619).
 */
export const classTitle = (node: ClassNode): string =>
  node.type ? `${node.label}&lt;${node.type}&gt;` : node.label;

/** The name row as read: a label marked as a markdown string is read without its backticks. */
const readTitle = (node: ClassNode, read: ReadLabel): LabelSource =>
  node.markdown
    ? read(classTitle({ ...node, label: node.label.slice(1, -1) }), true)
    : read(classTitle(node));

// A member written wholly as a markdown string after its visibility: `+"`name **b**`"`.
const RE_MARKDOWN_MEMBER = /^([+\-#~]?)("`[^`]*`")$/;

/**
 * A member row as read. A member written wholly as a markdown string is markdown, with its
 * visibility in front as written (a markdown escape, so `-` or `+` never starts a list).
 * Any other member is read as a whole, so a markdown string beside other text is drawn as
 * written.
 */
function readMember(text: string, read: ReadLabel): LabelSource {
  const md = RE_MARKDOWN_MEMBER.exec(text);
  if (!md) return read(text);
  const source = read(md[2] as string);
  return md[1] ? { ...source, text: `\\${md[1]}${source.text}` } : source;
}

/**
 * Measures one class box. Text is read by `read` (core's label handler, #1368) and laid out by
 * core's label layout: tags and a written `\n` are read everywhere, markdown in a markdown
 * string, and v12's markdown reading of plain text (`**bold**`, `_italic_`) only with
 * `legacyMarkdown`. A generic's brackets come as `&lt;` and `&gt;`, so `List~Data~`
 * is text whatever the type's name (D619); a `<T>` the author types stays text unless `T` is a
 * known tag.
 *
 * Heights follow v12's `classBox` (P = padding, rows = the compartment's text):
 * - header: P, the annotation and the name, P;
 * - a compartment with rows: P, rows (3 px apart), P; a methods compartment under an empty
 *   attributes one starts 1.5 P down (v12 held P/2 for the missing attributes);
 * - an empty compartment: 2 P, or 1.5 P each when the class has no members at all;
 * - `hideEmptyMembersBox` and no members: the header alone.
 */
export function measureBox(
  node: ClassNode,
  font: FontKey,
  measurer: Measurer,
  m: BoxMetrics,
  read: ReadLabel,
  inline?: InlineSpans
): ClassBoxGeometry {
  const measure = (source: LabelSource, style: StyleBits): MeasuredLabel =>
    layoutLabel(source.text, font, Infinity, measurer, { ...source, style, inline });
  // A blank row (`class A[" "]`) still takes a line.
  const { lineHeight } = measurer.metrics(font);
  const tall = (label: MeasuredLabel): number => Math.max(label.height, lineHeight);
  const P = m.pad.y;
  let y = P;
  const centred: { text: string; label: MeasuredLabel; style: StyleBits; y: number }[] = [];
  const first = node.annotations[0];
  let annotation: (typeof centred)[number] | undefined;
  if (first !== undefined) {
    const text = `«${first}»`;
    annotation = { text, label: measure(read(text), 0), style: 0, y };
    centred.push(annotation);
    y += tall(annotation.label);
  }
  const title = classTitle(node);
  const name = {
    text: title,
    label: measure(readTitle(node, read), Style.Bold),
    style: Style.Bold,
    y,
  };
  centred.push(name);
  y += tall(name.label) + P;

  let widest = Math.max(...centred.map((r) => r.label.width));
  const none = node.attributes.length + node.methods.length === 0;
  const compartments: ClassCompartment[] = [];
  const dividers: number[] = [];
  if (!none || !m.hideEmpty) {
    for (const [kind, list] of [
      ['attributes', node.attributes],
      ['methods', node.methods],
    ] as const) {
      dividers.push(y);
      const top = y;
      const rows: ClassRow[] = [];
      const lead = kind === 'methods' && node.attributes.length === 0 ? 1.5 * P : P;
      let at = top + lead;
      for (const member of list) {
        const text = memberLabel(member);
        const style = CLASSIFIER_STYLE[member.classifier] ?? 0;
        const label = measure(readMember(text, read), style);
        if (rows.length > 0) at += m.rowGap;
        rows.push({
          text,
          label,
          x: m.pad.x,
          y: at,
          anchor: 'start',
          style,
          member,
          ast: member.ast,
        });
        at += tall(label);
        widest = Math.max(widest, label.width);
      }
      const empty = none ? 1.5 * P : 2 * P;
      const height = rows.length > 0 ? at + P - top : empty;
      compartments.push({ kind, top, height, rows });
      y = top + height;
    }
  }
  const width = widest + 2 * m.pad.x;
  const row = (r: (typeof centred)[number]): ClassRow => ({
    text: r.text,
    label: r.label,
    x: width / 2,
    y: r.y,
    anchor: 'middle',
    style: r.style,
  });
  return {
    width,
    height: y,
    ...(annotation ? { annotation: row(annotation) } : {}),
    name: row(name),
    compartments,
    dividers,
  };
}
