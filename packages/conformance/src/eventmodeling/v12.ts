// cspell:words gwts dedented
/**
 * The v12 side of event modeling parity (#602): a plain-data snapshot of what mermaid\@12 built,
 * in the shape `v13.ts` takes from v13's `EventModel` and `eventModelStructure`:
 * - `lanes`, `boxes` and `relations`: v12's `getState()` (lanes by index and label; per box the
 *   frame id, kind keyword, lane index, and its text as plain text; relations by frame ids), run
 *   against `oracle-env.ts`'s stub document;
 * - `frames`, `entities`, `dataBlocks`, `notes`, `gwts`: the Langium AST v12 kept
 *   (`oracle-env.ts` keeps it on the DB), D526;
 * - `title`, `accTitle`, `accDescr`: the DB's values (the oracle never passes the front matter
 *   on, so the title is the in-text one; the v13 side leaves the front-matter title out too).
 *
 * Normalisation, chosen so the snapshot holds what v12 built and nothing else:
 * - text is what v12 drew: each `encodeEntities` placeholder as the character a browser showed
 *   for the `&name;` v12 wrote (the full HTML named set, the `entities` package);
 * - a box's text is its HTML (`<b>name</b><br/><br/><code …>data</code>`) as plain text: `<br/>`
 *   and `&nbsp;` as blanks, then every blank run as one space and trimmed, as a browser lays it
 *   out (other markup is kept, so data holding HTML shows up as a difference). v12's data slicing
 *   stays as v12 did it: where it lost characters, the data differs (D523, listed);
 * - D524 is applied to v12's values: `title`, `accTitle` and `accDescr` through the common value
 *   converter's regexes (`common/matcher.ts`, `valueConverter.ts`), which v12's event modeling
 *   grammar never ran. The DB values are the raw images otherwise;
 * - D523 is applied to v12's raw data images for the AST lists (frames' inline data, data
 *   blocks, notes) with Pele's `blockText` (MIT, `model.ts:86-100`), an implementation apart
 *   from v13's; quoted data is taken between the quotes;
 * - a kind is the keyword as written; a `gwt` step is its entity name (v12's grammar did not
 *   keep the step's kind).
 */
import { decodeHTMLStrict } from 'entities/decode';
import { withStubDocument } from './oracle-env.ts';

/** A placeholder `ﬂ°name¶ß` / `ﬂ°°123¶ß`, which v12's HTML wrote as `&name;` / `&#123;`. */
const RE_PLACEHOLDER = /ﬂ°(°?)(\w+)¶ß/g;

/** v12's text as a browser drew it: its placeholders as their characters. */
export const d = (text: string): string =>
  text.replace(RE_PLACEHOLDER, (_, hash: string, name: string) =>
    decodeHTMLStrict(`&${hash ? '#' : ''}${name};`)
  );

/** `diagram.type` values mermaid\@12 reports for event modeling sources. */
export const EVENTMODELING_V12_TYPES = ['eventmodeling'];

export interface EventModelSnapshot {
  lanes: { index: number; label: string }[];
  boxes: { frame: string; kind: string; lane: number; text: string }[];
  relations: { source: string; target: string }[];
  frames: {
    id: string;
    reset: boolean;
    kind: string;
    name: string;
    sources: string[];
    dataRef: string | undefined;
    data: string | undefined;
    dataType: string | undefined;
  }[];
  entities: string[];
  dataBlocks: { name: string; type: string | undefined; text: string }[];
  notes: { frame: string; type: string | undefined; text: string }[];
  gwts: { frame: string; given: string[]; when: string[]; then: string[] }[];
  title: string;
  accTitle: string;
  accDescr: string;
}

/** Every blank run as one space, trimmed: text as a browser lays it out. */
export const plain = (text: string): string => text.replace(/\s+/g, ' ').trim();

// ---- v12's AST (Langium, `@mermaid-js/parser@2.0.1`) ----------------------------------------

interface Ref {
  $refText: string;
}
interface EmFrameV12 {
  $type: string;
  name: string;
  modelEntityType: string;
  entityIdentifier: string;
  sourceFrames: Ref[];
  dataReference?: Ref;
  dataType?: string;
  dataInlineValue?: string;
}
interface EventModelV12 {
  frames: EmFrameV12[];
  modelEntities: { name: string }[];
  dataEntities: { name: string; dataType?: string; dataBlockValue: string }[];
  noteEntities: { sourceFrame: Ref; dataType?: string; dataBlockValue: string }[];
  gwtEntities: {
    sourceFrame: Ref;
    givenStatements: { entityIdentifier: Ref }[];
    whenStatements: { entityIdentifier: Ref }[];
    thenStatements: { entityIdentifier: Ref }[];
  }[];
}
interface BoxV12 {
  frame: EmFrameV12;
  swimlane: { index: number };
  text: string;
}
interface StateV12 {
  boxes: BoxV12[];
  relations: { sourceBox: BoxV12; targetBox: BoxV12 }[];
  sortedSwimlanesArray: { index: number; label: string }[];
}
interface EventModelingDbV12 {
  getState(): StateV12;
  lastAst?: EventModelV12;
  getDiagramTitle(): string;
  getAccTitle(): string;
  getAccDescription(): string;
}

/** A box's HTML as plain text (see the module comment). */
export function boxText(html: string): string {
  const text = html
    .replace(/<\/?b>/g, '')
    .replace(/<code[^>]*>/, '')
    .replace(/<\/code>$/, '')
    .replace(/<br\/>/g, ' ')
    .replace(/&nbsp;/g, ' ');
  return plain(d(text));
}

/**
 * Pele's `blockText` (`src/diagrams/eventmodeling/model.ts:86-100`, MIT): the text between the
 * outer braces, without the indentation its lines share; quoted data between its quotes.
 */
export function blockText(raw: string): string {
  const open = raw.startsWith('{') ? 0 : -1;
  const close = raw.lastIndexOf('}');
  let inner = '';
  if (open !== -1 && close > open) inner = raw.slice(open + 1, close);
  else if (open === -1 && raw.length >= 2) inner = raw.slice(1, -1);
  const lines = inner.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && (lines[0] ?? '').trim() === '') lines.shift();
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
  let indent = Infinity;
  for (const line of lines) {
    if (line.trim() === '') continue;
    indent = Math.min(indent, line.length - line.trimStart().length);
  }
  return lines.map((line) => line.slice(Math.min(indent, line.length)).trimEnd()).join('\n');
}

// The common value converter (`common/matcher.ts`, `valueConverter.ts` `runCommonConverter`).
const ACC_DESCR = /accDescr(?:[\t ]*:([^\n\r]*)|\s*{([^}]*)})/;
const ACC_TITLE = /accTitle[\t ]*:([^\n\r]*)/;
const TITLE = /title([\t ][^\n\r]*|)/;

/** D524: the common converter on a raw value; `''` stays `''`. */
export function converted(raw: string, regex: RegExp): string {
  const match = regex.exec(raw);
  if (!match) return raw;
  if (match[1] !== undefined) return match[1].trim().replace(/[\t ]{2,}/gm, ' ');
  if (match[2] !== undefined) {
    return match[2]
      .replace(/^\s*/gm, '')
      .replace(/\s+$/gm, '')
      .replace(/[\t ]{2,}/gm, ' ')
      .replace(/[\n\r]{2,}/gm, '\n');
  }
  return raw;
}

const opt = (v: string | undefined) => (v === undefined ? undefined : d(v));

export function eventModelingV12Snapshot(dbValue: unknown): EventModelSnapshot {
  const db = dbValue as EventModelingDbV12;
  const ast = db.lastAst;
  if (!ast) throw new Error('the oracle kept no event modeling AST (oracle-env.ts)');
  const state = withStubDocument(() => db.getState());
  return {
    lanes: state.sortedSwimlanesArray.map((l) => ({ index: l.index, label: d(l.label) })),
    boxes: state.boxes.map((b) => ({
      frame: b.frame.name,
      kind: b.frame.modelEntityType,
      lane: b.swimlane.index,
      text: boxText(b.text),
    })),
    relations: state.relations.map((r) => ({
      source: r.sourceBox.frame.name,
      target: r.targetBox.frame.name,
    })),
    frames: ast.frames.map((f) => ({
      id: f.name,
      reset: f.$type === 'EmResetFrame',
      kind: f.modelEntityType,
      name: f.entityIdentifier,
      sources: f.sourceFrames.map((s) => s.$refText),
      dataRef: f.dataReference?.$refText,
      data: f.dataInlineValue === undefined ? undefined : blockText(d(f.dataInlineValue)),
      dataType: f.dataType,
    })),
    entities: ast.modelEntities.map((e) => e.name),
    dataBlocks: ast.dataEntities.map((e) => ({
      name: e.name,
      type: e.dataType,
      text: blockText(d(e.dataBlockValue)),
    })),
    notes: ast.noteEntities.map((n) => ({
      frame: n.sourceFrame.$refText,
      type: n.dataType,
      text: blockText(d(n.dataBlockValue)),
    })),
    gwts: ast.gwtEntities.map((g) => ({
      frame: g.sourceFrame.$refText,
      given: g.givenStatements.map((s) => s.entityIdentifier.$refText),
      when: g.whenStatements.map((s) => s.entityIdentifier.$refText),
      then: g.thenStatements.map((s) => s.entityIdentifier.$refText),
    })),
    title: converted(d(db.getDiagramTitle()), TITLE),
    accTitle: converted(d(db.getAccTitle()), ACC_TITLE),
    accDescr: converted(opt(db.getAccDescription()) ?? '', ACC_DESCR),
  };
}

// ---- v12's geometry, for the layout comparison (#604) ------------------------------------------

/** v12's placement and relation segments, under the stub document's 0 × 1 px text. */
export interface EventModelV12Geometry {
  lanes: { index: number; y: number; height: number; width: number }[];
  boxes: { frame: string; lane: number; x: number; y: number; width: number; height: number }[];
  /** v12's `renderer.ts` segment for each relation: `[x1, y1, x2, y2]`. */
  relations: { source: string; target: string; sameLane: boolean; points: number[] }[];
}

interface PlacedBoxV12 extends BoxV12 {
  x: number;
  dimension: { width: number; height: number };
  swimlane: { index: number; y: number };
}

/**
 * The boxes, lanes and relation segments of v12's `getState()` and `renderer.ts`: a box at
 * `(x, swimlane.y + 15)`; a lane from x 0, `maxR + 15` wide; a relation from ⅔ of the source's
 * width to ⅓ of the target's, bottom to top or top to bottom (`renderer.ts:62-100`).
 */
export function eventModelingV12Geometry(dbValue: unknown): EventModelV12Geometry {
  const db = dbValue as EventModelingDbV12;
  const state = withStubDocument(() => db.getState()) as unknown as {
    boxes: PlacedBoxV12[];
    relations: { sourceBox: PlacedBoxV12; targetBox: PlacedBoxV12 }[];
    sortedSwimlanesArray: { index: number; y: number; height: number }[];
    maxR: number;
  };
  const pad = 15;
  return {
    lanes: state.sortedSwimlanesArray.map((l) => ({
      index: l.index,
      y: l.y,
      height: l.height,
      width: state.maxR + pad,
    })),
    boxes: state.boxes.map((b) => ({
      frame: b.frame.name,
      lane: b.swimlane.index,
      x: b.x,
      y: b.swimlane.y + pad,
      width: b.dimension.width,
      height: b.dimension.height,
    })),
    relations: state.relations.map(({ sourceBox: s, targetBox: t }) => {
      const sy = s.swimlane.y + pad;
      const ty = t.swimlane.y + pad;
      const up = sy > ty;
      return {
        source: s.frame.name,
        target: t.frame.name,
        sameLane: s.swimlane.index === t.swimlane.index,
        points: [
          s.x + (s.dimension.width * 2) / 3,
          up ? sy : sy + s.dimension.height,
          t.x + t.dimension.width / 3,
          up ? ty + t.dimension.height : ty,
        ],
      };
    }),
  };
}
