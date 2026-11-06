/**
 * The radar model as v12's DB resolved it (`db.ts`, parser-method §4): from the parsed
 * statements to the {@link RadarModel}. Axes come before curves whatever the text order;
 * positional entries are kept as written and detailed ones reordered to the axes (the first per
 * axis wins); options are the last of each name, with v12's defaults and `ticks` at most 32.
 * v12's two DB throws are error diagnostics with its messages; D356's four findings are
 * warnings, one per kind with `related` positions. Two of them are about drawing (a curve the
 * layout leaves out, an empty range) but known from the text, so they are found here, where
 * they have positions; the layout only keeps its guards.
 */
import type { AstId, Diagnostics, Range, RelatedInfo } from '@mermaid-js/core/parser-kit';
import { largestEntry, MAX_TICKS } from '../model.ts';
import type { RadarAxis, RadarCurve, RadarEntry, RadarModel, RadarOptions } from '../model.ts';
import type { RadarAxisNode, RadarCurveNode, RadarEntryNode, RadarOptionNode } from './ast.ts';

/** A detailed entry names no axis: it is ignored (D356). */
export const RADAR_UNKNOWN_AXIS = 'RADAR_UNKNOWN_AXIS';
/** `ticks` above {@link MAX_TICKS}: clamped (D356; v12 only logged it). */
export const RADAR_TICKS_CLAMPED = 'RADAR_TICKS_CLAMPED';
/** v12 `db.ts`'s `Missing entry for axis …`: a detailed curve leaves an axis out. */
export const RADAR_MISSING_ENTRY = 'RADAR_MISSING_ENTRY';
/** v12 `db.ts`'s `Axes must be populated …`: detailed entries and no axis at all. */
export const RADAR_NO_AXES = 'RADAR_NO_AXES';
/** A curve whose entry count is not the axis count: not drawn (D356; v12 skipped it silently). */
export const RADAR_CURVE_SKIPPED = 'RADAR_CURVE_SKIPPED';
/** `max = min`: every curve is drawn at the centre (D356; v12 wrote NaN). */
export const RADAR_EMPTY_RANGE = 'RADAR_EMPTY_RANGE';

export type OptionName = RadarOptionNode['name'];

/** What the parser read, for {@link normalise}. */
export interface RadarParts {
  readonly src: string;
  readonly axes: readonly RadarAxisNode[];
  readonly curves: readonly RadarCurveNode[];
  /** The last option of each name. */
  readonly options: ReadonlyMap<OptionName, RadarOptionNode>;
  /** The last in-text values ('' when none). */
  readonly title: string;
  /** The AST id of the last `title` statement, if any. */
  readonly titleAstId: AstId | undefined;
  readonly accTitle: string;
  readonly accDescr: string;
  /** The front-matter title, for D218. */
  readonly frontMatterTitle: string | undefined;
}

/** v12's option defaults (`db.ts`). */
const DEFAULT_OPTIONS: RadarOptions = {
  showLegend: true,
  ticks: 5,
  max: null,
  min: 0,
  graticule: 'circle',
};

/** A detailed entry that names no axis, and its curve. */
interface UnknownEntry {
  readonly entry: RadarEntryNode;
  readonly curve: RadarCurveNode;
}

/**
 * The frozen model. Errors and warnings go to `diagnostics`; `warnings` is left empty here
 * and filled by the caller once the list is final.
 */
export function normalise(
  parts: RadarParts,
  diagnostics: Diagnostics
): Omit<RadarModel, 'warnings'> {
  const axes: RadarAxis[] = parts.axes.map((a) =>
    Object.freeze({ name: a.name, label: a.label ?? a.name, astId: a.id })
  );
  const unknown: UnknownEntry[] = [];
  const curves = parts.curves.map((c) => resolveCurve(c, axes, unknown, diagnostics));
  if (axes.length > 0) unknownAxes(unknown, diagnostics);
  const options = resolveOptions(parts, diagnostics);
  drawingWarnings(parts, curves, options, diagnostics);
  // D218: the in-text title if non-empty, else the front-matter one.
  const title = parts.title || parts.frontMatterTitle;
  // The drawn title's `data-ast`: the last `title` statement's, when its text is the title.
  const titleAstId = parts.title ? parts.titleAstId : undefined;
  return {
    axes: Object.freeze(axes),
    curves: Object.freeze(curves),
    options,
    ...(title ? { title } : {}),
    ...(titleAstId ? { titleAstId } : {}),
    accTitle: parts.accTitle,
    accDescr: parts.accDescr,
  };
}

/**
 * v12 `computeCurveEntries`: positional entries as written; detailed ones, for each axis in
 * order, the first entry naming it. v12 threw when an axis had none, and when there were no
 * axes at all: errors here (v12's messages), and the curve keeps the entries it has.
 */
function resolveCurve(
  c: RadarCurveNode,
  axes: readonly RadarAxis[],
  unknown: UnknownEntry[],
  diagnostics: Diagnostics
): RadarCurve {
  const entry = (e: RadarEntryNode): RadarEntry => Object.freeze({ value: e.value, astId: e.id });
  const curve = (entries: RadarEntry[]): RadarCurve =>
    Object.freeze({
      name: c.name,
      label: c.label ?? c.name,
      entries: Object.freeze(entries),
      astId: c.id,
    });
  const nodes = c.children;
  if (nodes[0]?.axis === undefined) return curve(nodes.map(entry));
  if (axes.length === 0) {
    diagnostics.error(
      RADAR_NO_AXES,
      'Axes must be populated before curves for reference entries',
      c.range
    );
    return curve([]);
  }
  const names = new Set(axes.map((a) => a.name));
  for (const e of nodes) if (!names.has(e.axis ?? '')) unknown.push({ entry: e, curve: c });
  const first = new Map<string, RadarEntryNode>();
  for (const e of nodes) if (e.axis !== undefined && !first.has(e.axis)) first.set(e.axis, e);
  const entries: RadarEntry[] = [];
  let missing: RadarAxis | undefined;
  for (const a of axes) {
    const e = first.get(a.name);
    if (e) entries.push(entry(e));
    else missing ??= a;
  }
  if (missing) {
    diagnostics.error(RADAR_MISSING_ENTRY, `Missing entry for axis ${missing.label}`, c.range);
  }
  return curve(entries);
}

/**
 * D356: one warning for the entries that name no axis, at the first; `related` points at its
 * curve and at each other such entry.
 */
function unknownAxes(unknown: readonly UnknownEntry[], diagnostics: Diagnostics): void {
  const say = (u: UnknownEntry) =>
    `\`${u.entry.axis ?? ''}\` in curve \`${u.curve.name}\` names no axis`;
  const at = (u: UnknownEntry): Range => u.entry.axisRange ?? u.entry.range;
  const [first, ...rest] = unknown;
  if (!first) return;
  const n = rest.length;
  const more = n === 0 ? '' : ` (and ${n} more ${n === 1 ? 'entry' : 'entries'})`;
  const related: RelatedInfo[] = [
    { message: `The curve \`${first.curve.name}\`.`, range: first.curve.range },
    ...rest.map((u) => ({ message: `${say(u)}.`, range: at(u) })),
  ];
  diagnostics.warning(
    RADAR_UNKNOWN_AXIS,
    `${say(first)}${more}: the value is ignored. Declare the axis with \`axis\`, or use the name of one.`,
    at(first),
    { related }
  );
}

/** A curve as `related` names it. */
const theCurve = (c: RadarCurveNode, rest = ''): RelatedInfo => ({
  message: `The curve \`${c.name}\`${rest}.`,
  range: c.range,
});

const values = (n: number): string => `${n} ${n === 1 ? 'value' : 'values'}`;

/**
 * D356's two findings about what is drawn, as the layout will draw it: a positional curve
 * whose entry count is not the axis count is left out (`RADAR_CURVE_SKIPPED`), and with
 * `max = min` (`max` unset: the largest entry of any curve) the drawn curves sit at the centre
 * (`RADAR_EMPTY_RANGE`). A detailed curve's entries are the axes' once resolved, or it is
 * already an error.
 */
function drawingWarnings(
  parts: RadarParts,
  curves: readonly RadarCurve[],
  options: RadarOptions,
  diagnostics: Diagnostics
): void {
  const n = parts.axes.length;
  const drawn: RadarCurveNode[] = [];
  const skipped: RadarCurveNode[] = [];
  parts.curves.forEach((c, i) => {
    if (n > 0 && curves[i]!.entries.length === n) drawn.push(c);
    else if (c.children[0]?.axis === undefined) skipped.push(c);
  });
  const [first, ...rest] = skipped;
  if (first) {
    const k = rest.length;
    const more = k === 0 ? '' : ` (and ${k} more ${k === 1 ? 'curve' : 'curves'})`;
    const has = values(first.children.length);
    const firstAxis = parts.axes[0];
    diagnostics.warning(
      RADAR_CURVE_SKIPPED,
      firstAxis
        ? `The curve \`${first.name}\` has ${has} for ${n} ${n === 1 ? 'axis' : 'axes'}${more}: it is not drawn. Give it one value per axis.`
        : `The curve \`${first.name}\` has ${has} and there is no axis${more}: it is not drawn. Declare the axes with \`axis\`.`,
      first.range,
      {
        related: [
          ...rest.map((c) => theCurve(c, `, with ${values(c.children.length)}`)),
          ...(firstAxis
            ? [{ message: `The first of the ${n} axes.`, range: firstAxis.range }]
            : []),
        ],
      }
    );
  }
  const max = options.max ?? largestEntry(curves);
  if (drawn.length === 0 || max !== options.min) return;
  emptyRange(parts, drawn, diagnostics);
}

/**
 * `RADAR_EMPTY_RANGE`, at the `max` option, else the `min` one, else the first drawn curve;
 * its message names only the options written.
 */
function emptyRange(
  parts: RadarParts,
  drawn: readonly RadarCurveNode[],
  diagnostics: Diagnostics
): void {
  const maxOption = parts.options.get('max');
  const minOption = parts.options.get('min');
  const written = (o: RadarOptionNode): string =>
    `\`${o.name} ${parts.src.slice(o.valueRange.start, o.valueRange.end)}\``;
  const tail = 'every curve is drawn at the centre.';
  let message = `Every value is 0, so the chart has no range: ${tail}`;
  if (maxOption && minOption)
    message = `${written(maxOption)} and ${written(minOption)} are the same value: ${tail}`;
  else if (maxOption)
    message = `${written(maxOption)} gives the chart no range, as values start at 0: ${tail}`;
  else if (minOption)
    message = `${written(minOption)} is the largest value too, so the chart has no range: ${tail}`;
  const at = maxOption ?? minOption;
  const related: RelatedInfo[] = [
    ...(maxOption && minOption ? [{ message: 'The `min` option.', range: minOption.range }] : []),
    ...(at ? drawn : drawn.slice(1)).map((c) => theCurve(c, ', drawn at the centre')),
  ];
  diagnostics.warning(RADAR_EMPTY_RANGE, message, (at ?? drawn[0]!).range, { related });
}

/** v12 `setOptions`: the last of each name, else the default; `ticks` at most 32. */
function resolveOptions(parts: RadarParts, diagnostics: Diagnostics): RadarOptions {
  const get = <V>(name: OptionName, fallback: V): V =>
    (parts.options.get(name)?.value as V | undefined) ?? fallback;
  let ticks = get('ticks', DEFAULT_OPTIONS.ticks);
  const t = parts.options.get('ticks');
  if (t && ticks > MAX_TICKS) {
    const written = parts.src.slice(t.valueRange.start, t.valueRange.end);
    diagnostics.warning(
      RADAR_TICKS_CLAMPED,
      `\`ticks ${written}\` is more than ${MAX_TICKS}: the chart draws ${MAX_TICKS} rings.`,
      t.valueRange,
      { related: [{ message: 'The `ticks` option that sets it.', range: t.range }] }
    );
    ticks = MAX_TICKS;
  }
  return Object.freeze({
    showLegend: get('showLegend', DEFAULT_OPTIONS.showLegend),
    ticks,
    max: get<number | null>('max', DEFAULT_OPTIONS.max),
    min: get('min', DEFAULT_OPTIONS.min),
    graticule: get('graticule', DEFAULT_OPTIONS.graticule),
  });
}
