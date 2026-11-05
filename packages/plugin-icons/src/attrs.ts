/**
 * Icon body attributes (D295, R-SEC-2): each value is parsed and checked, and comes out as one
 * of the writer's typed attributes or not at all. Paint, opacity, stroke and font values go
 * through core's style allow-list (`checkStyle`, `checkColor`); geometry, path data, points and
 * transforms are parsed here.
 */
import { checkColor, checkStyle, STYLE_PROPERTIES, type Attrs } from '@mermaid-js/core/svg';

type Mutable = Record<string, unknown>;

/** What reading one element's attributes found, besides the attributes. */
export interface AttrReport {
  /** A paint or reference was replaced or dropped, so the icon may draw differently. */
  simplified: boolean;
  /** `display="none"`: the element draws nothing. */
  hidden: boolean;
}

const RE_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i;
const RE_PERCENT = /^(?:\d+(?:\.\d*)?|\.\d+)%$/;
// cspell:disable-next-line
const RE_PATH = /^[MLHVCSQTAZmlhvcsqtaz\d\s,.eE+-]*$/;
const RE_URL = /^url\s*\(/i;
const RE_TRANSFORM = /^\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*,?/;
const RE_SEPARATORS = /[\s,]+/;

/** Argument counts each transform function takes. */
const TRANSFORM_ARGS: Readonly<Record<string, readonly number[]>> = {
  matrix: [6],
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1],
};

const NUMBER_ATTRS: ReadonlySet<string> = new Set([
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'stroke-miterlimit',
]);

const KEYWORDS: Readonly<Record<string, ReadonlySet<string>>> = {
  'fill-rule': new Set(['nonzero', 'evenodd']),
  'clip-rule': new Set(['nonzero', 'evenodd']),
  'text-anchor': new Set(['start', 'middle', 'end']),
  'dominant-baseline': new Set(['auto', 'middle', 'central', 'hanging', 'alphabetic']),
};

/** Attributes that point at another element: dropped, and the icon reported simplified. */
const REFERENCES: ReadonlySet<string> = new Set([
  'clip-path',
  'mask',
  'filter',
  'marker-start',
  'marker-mid',
  'marker-end',
]);

function toNumber(value: string): number | undefined {
  const v = value.trim();
  if (!RE_NUMBER.test(v)) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function numbers(value: string): number[] | undefined {
  const parts = value.trim().split(RE_SEPARATORS);
  if (parts.length === 1 && parts[0] === '') return [];
  const out: number[] = [];
  for (const p of parts) {
    const n = toNumber(p);
    if (n === undefined || p.endsWith('px')) return undefined;
    out.push(n);
  }
  return out;
}

/** A transform list rebuilt from checked functions and numbers, or undefined. */
function transform(value: string): string | undefined {
  const out: string[] = [];
  let rest = value.trim();
  while (rest !== '') {
    const m = RE_TRANSFORM.exec(rest);
    if (!m) return undefined;
    const name = m[1] as string;
    const args = numbers(m[2] as string);
    if (args === undefined || !(TRANSFORM_ARGS[name] as readonly number[]).includes(args.length))
      return undefined;
    out.push(`${name}(${args.map(String).join(' ')})`);
    rest = rest.slice(m[0].length).trim();
  }
  return out.length > 0 ? out.join(' ') : undefined;
}

/** A paint for `fill`/`stroke`: a `url(…)` reference becomes `currentColor` (D295). */
function paint(name: string, value: string, report: AttrReport): string | undefined {
  if (RE_URL.test(value.trim())) {
    report.simplified = true;
    return 'currentColor';
  }
  return styled(name, value);
}

/** A value through core's style allow-list, as the attribute `name` takes it. */
function styled(name: string, value: string): string | undefined {
  const checked = checkStyle([`${name}:${value}`]);
  const shape = checked.shape as Readonly<Record<string, string | undefined>>;
  const text = checked.text as Readonly<Record<string, string | undefined>>;
  return shape[name] ?? text[name];
}

function sized(value: string): number | `${number}%` | undefined {
  const v = value.trim();
  return RE_PERCENT.test(v) ? (v as `${number}%`) : toNumber(v);
}

/** The checked value of one attribute, or undefined to drop it. */
function attrValue(name: string, value: string, report: AttrReport): unknown {
  if (NUMBER_ATTRS.has(name)) return toNumber(value);
  const keywords = Object.hasOwn(KEYWORDS, name) ? KEYWORDS[name] : undefined;
  if (keywords !== undefined) return keywords.has(value.trim()) ? value.trim() : undefined;
  switch (name) {
    case 'width':
    case 'height':
      return sized(value);
    case 'd':
      return RE_PATH.test(value) ? value.trim() : undefined;
    case 'points': {
      const list = numbers(value);
      return list === undefined || list.length < 2 ? undefined : list.slice(0, list.length & ~1);
    }
    case 'transform':
      return transform(value);
    case 'fill':
    case 'stroke':
      return paint(name, value, report);
    case 'color':
      return RE_URL.test(value.trim()) ? undefined : checkColor(value);
  }
  return STYLE_PROPERTIES.has(name) ? styled(name, value) : undefined;
}

/** Sets one attribute from a body, or notes why it was not kept. */
function readAttr(out: Mutable, name: string, value: string, report: AttrReport): void {
  if (name === 'display') {
    if (value.trim() === 'none') report.hidden = true;
    return;
  }
  if (REFERENCES.has(name)) {
    if (value.trim() !== 'none') report.simplified = true;
    return;
  }
  const v = attrValue(name, value, report);
  if (v === undefined) {
    if (name === 'fill' || name === 'stroke') report.simplified = true;
    return;
  }
  out[name] = v;
}

/** One element's attributes: its presentation attributes, then its `style`, which wins. */
export function readAttrs(raw: ReadonlyMap<string, string>, report: AttrReport): Attrs {
  const out: Mutable = {};
  for (const [name, value] of raw) if (name !== 'style') readAttr(out, name, value, report);
  const style = raw.get('style');
  if (style !== undefined) {
    for (const decl of style.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const name = decl.slice(0, at).trim().toLowerCase();
      readAttr(out, name, decl.slice(at + 1).replace(/!important/gi, ''), report);
    }
  }
  return out as Attrs;
}
