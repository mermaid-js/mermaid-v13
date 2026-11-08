/**
 * d3-format 3.1.2's `format` in its default locale (`,` thousands in groups of three, `.`
 * decimal, `$` currency prefix, `−` minus, `NaN`), re-implemented for treemap's `valueFormat`
 * (D409) since the package has no dependency (R-PERF-2). The specifier grammar is d3's:
 * `[[fill]align][sign][symbol][0][width][,][.precision][~][type]`. Each step follows d3's
 * `locale.js`, `formatSpecifier.js`, `formatTypes.js`, `formatTrim.js`, `formatDecimal.js`,
 * `formatRounded.js`, `formatPrefixAuto.js` and `formatGroup.js`, in its order, so the output is
 * d3's character for character (`packages/conformance/src/treemap/value-format.spec.ts`).
 */

/** d3's specifier pattern. */
const RE_SPECIFIER = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

const MINUS = '−';
const PERCENT = '%';
const CURRENCY = '$';
const THOUSANDS = ',';
const GROUP = 3;
const DECIMAL = '.';
const NAN = 'NaN';
/** SI prefixes from 1e-24 to 1e24 (`s`). */
const PREFIXES = [
  'y',
  'z',
  'a',
  'f',
  'p',
  'n',
  'µ',
  'm',
  '',
  'k',
  'M',
  'G',
  'T',
  'P',
  'E',
  'Z',
  'Y',
];
/** The index of the empty prefix in {@link PREFIXES}, and the largest prefix exponent / 3. */
const UNIT_PREFIX = 8;
/** `formatDecimal` switches to `toLocaleString` at this size, where `toString` writes `e+21`. */
const LOCALE_FROM = 1e21;
/** The precision without one, for the `""` type, and the clamps (`[1, 21]` and `[0, 20]`). */
const DEFAULT_PRECISION = 6;
const SHORTEST_PRECISION = 12;
const MAX_SIGNIFICANT = 21;
const MAX_FIXED = 20;
const CHAR_0 = 48;
const CHAR_9 = 57;
const CHAR_DOT = 46;
const RADIX = { b: 2, o: 8, x: 16 } as const;

/** One formatted value: its digits, and for `s` the SI exponent the digits were scaled by. */
interface Digits {
  readonly text: string;
  readonly prefixExponent?: number;
}

type FormatType = (x: number, p: number) => Digits;

const plain =
  (f: (x: number, p: number) => string): FormatType =>
  (x, p) => ({ text: f(x, p) });

/** `formatDecimalParts`: the coefficient digits and exponent of `x` with `p` significant digits. */
function decimalParts(x: number, p?: number): [string, number] | undefined {
  if (!Number.isFinite(x) || x === 0) return undefined;
  const s = p ? x.toExponential(p - 1) : x.toExponential();
  const i = s.indexOf('e');
  const coefficient = s.slice(0, i);
  return [
    coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
    +s.slice(i + 1),
  ];
}

function formatDecimal(x: number): string {
  const r = Math.round(x);
  return Math.abs(r) >= LOCALE_FROM ? r.toLocaleString('en').replace(/,/g, '') : r.toString(10);
}

function formatRounded(x: number, p: number): string {
  const d = decimalParts(x, p);
  if (!d) return String(x);
  const [coefficient, exponent] = d;
  if (exponent < 0) return '0.' + '0'.repeat(-exponent - 1) + coefficient;
  if (coefficient.length > exponent + 1)
    return coefficient.slice(0, exponent + 1) + '.' + coefficient.slice(exponent + 1);
  return coefficient + '0'.repeat(exponent - coefficient.length + 1);
}

function formatPrefixAuto(x: number, p: number): Digits {
  const d = decimalParts(x, p);
  if (!d) return { text: x.toPrecision(p) };
  const [coefficient, exponent] = d;
  const prefixExponent =
    Math.max(-UNIT_PREFIX, Math.min(UNIT_PREFIX, Math.floor(exponent / 3))) * 3;
  const i = exponent - prefixExponent + 1;
  const n = coefficient.length;
  let text: string;
  if (i === n) text = coefficient;
  else if (i > n) text = coefficient + '0'.repeat(i - n);
  else if (i > 0) text = coefficient.slice(0, i) + '.' + coefficient.slice(i);
  else text = '0.' + '0'.repeat(-i) + decimalParts(x, Math.max(0, p + i - 1))![0];
  return { text, prefixExponent };
}

const radix =
  (base: number, upper = false): FormatType =>
  (x) => {
    const s = Math.round(x).toString(base);
    return { text: upper ? s.toUpperCase() : s };
  };

/** `formatTypes`. */
const TYPES: Readonly<Record<string, FormatType>> = {
  '%': plain((x, p) => (x * 100).toFixed(p)),
  b: radix(RADIX.b),
  c: plain((x) => String(x)),
  d: plain(formatDecimal),
  e: plain((x, p) => x.toExponential(p)),
  f: plain((x, p) => x.toFixed(p)),
  g: plain((x, p) => x.toPrecision(p)),
  o: radix(RADIX.o),
  p: plain((x, p) => formatRounded(x * 100, p)),
  r: plain(formatRounded),
  s: formatPrefixAuto,
  X: radix(RADIX.x, true),
  x: radix(RADIX.x),
};

/** `formatTrim`: drops insignificant trailing zeros, `1.2000k` → `1.2k`. */
function formatTrim(s: string): string {
  let i0 = -1;
  let i1 = 0;
  out: for (let i = 1; i < s.length; ++i) {
    switch (s.charAt(i)) {
      case '.':
        i0 = i1 = i;
        break;
      case '0':
        if (i0 === 0) i0 = i;
        i1 = i;
        break;
      default:
        if (!+s.charAt(i)) break out;
        if (i0 > 0) i0 = 0;
        break;
    }
  }
  return i0 > 0 ? s.slice(0, i0) + s.slice(i1 + 1) : s;
}

/** `formatGroup` with the locale's grouping `[3]` and `,`. */
function group(value: string, width: number): string {
  let i = value.length;
  const t: string[] = [];
  let g = GROUP;
  let length = 0;
  while (i > 0 && g > 0) {
    if (length + g + 1 > width) g = Math.max(1, width - length);
    t.push(value.substring((i -= g), i + g));
    if ((length += g + 1) > width) break;
    g = GROUP;
  }
  return t.reverse().join(THOUSANDS);
}

/** A parsed specifier, after d3's rewrites of the type, the precision and the zero fill. */
interface Spec {
  readonly fill: string;
  readonly align: string;
  readonly sign: string;
  readonly symbol: string;
  readonly zero: boolean;
  readonly width: number | undefined;
  readonly comma: boolean;
  readonly precision: number | undefined;
  readonly trim: boolean;
  readonly type: string;
}

function parse(specifier: string): Spec | undefined {
  const m = RE_SPECIFIER.exec(specifier);
  if (!m) return undefined;
  let spec: Spec = {
    fill: m[1] ?? ' ',
    align: m[2] ?? '>',
    sign: m[3] ?? '-',
    symbol: m[4] ?? '',
    zero: m[5] !== undefined,
    width: m[6] === undefined ? undefined : +m[6],
    comma: m[7] !== undefined,
    precision: m[8] === undefined ? undefined : +m[8].slice(1),
    trim: m[9] !== undefined,
    type: m[10] ?? '',
  };
  // `n` is `,g`; the empty type, and any unknown one, is `.12~g`.
  if (spec.type === 'n') spec = { ...spec, comma: true, type: 'g' };
  else if (TYPES[spec.type] === undefined)
    spec = { ...spec, precision: spec.precision ?? SHORTEST_PRECISION, trim: true, type: 'g' };
  // Zero fill pads after the sign and before the digits.
  if (spec.zero || (spec.fill === '0' && spec.align === '='))
    spec = { ...spec, zero: true, fill: '0', align: '=' };
  return spec;
}

/** The currency or `0b`/`0o`/`0x` prefix, and the percent suffix. */
function affixes(spec: Spec): [prefix: string, suffix: string] {
  if (spec.symbol === '$') return [CURRENCY, ''];
  const base = spec.symbol === '#' && /[boxX]/.test(spec.type) ? '0' + spec.type.toLowerCase() : '';
  return [base, /[%p]/.test(spec.type) ? PERCENT : ''];
}

/** The precision, d3's default 6 or the given one clamped: `[1, 21]` significant, `[0, 20]` fixed. */
function precisionOf(spec: Spec): number {
  if (spec.precision === undefined) return DEFAULT_PRECISION;
  if (/[gprs]/.test(spec.type)) return Math.max(1, Math.min(MAX_SIGNIFICANT, spec.precision));
  return Math.max(0, Math.min(MAX_FIXED, spec.precision));
}

/** The sign in front: a minus (or `(`) when negative, else `+` or ` ` when asked for. */
function signOf(sign: string, negative: boolean): string {
  if (negative) return sign === '(' ? sign : MINUS;
  return sign === '-' || sign === '(' ? '' : sign;
}

/** One value's parts before padding: what goes before, the groupable digits, what goes after. */
type Parts = [prefix: string, digits: string, suffix: string];

/** A number's parts (`locale.js`'s `format` up to the grouping). */
function numberParts(spec: Spec, p: number, input: number): Parts {
  const [prefix, suffix] = affixes(spec);
  const x = +input;
  // -0 is not less than 0, but 1 / -0 is.
  let negative = x < 0 || 1 / x < 0;
  let value = NAN;
  let prefixExponent: number | undefined;
  if (!Number.isNaN(x)) ({ text: value, prefixExponent } = TYPES[spec.type]!(Math.abs(x), p));
  if (spec.trim) value = formatTrim(value);
  // A negative value that rounds to zero loses its sign, unless `+` asks for one.
  if (negative && +value === 0 && spec.sign !== '+') negative = false;
  const si =
    spec.type === 's' && !Number.isNaN(+value) && prefixExponent !== undefined
      ? PREFIXES[UNIT_PREFIX + prefixExponent / 3]!
      : '';
  let valueSuffix = si + suffix + (negative && spec.sign === '(' ? ')' : '');
  // Split the integer part, which groups, from the fraction or exponent, which does not.
  if (/[defgprs%]/.test(spec.type)) {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c < CHAR_0 || c > CHAR_9) {
        valueSuffix =
          (c === CHAR_DOT ? DECIMAL + value.slice(i + 1) : value.slice(i)) + valueSuffix;
        value = value.slice(0, i);
        break;
      }
    }
  }
  return [signOf(spec.sign, negative) + prefix, value, valueSuffix];
}

/** Groups, pads to `width` and aligns one value's parts (`locale.js`'s `format`, its end). */
function padded(spec: Spec, [prefix, digits, suffix]: Parts): string {
  const { comma, zero, width, fill } = spec;
  // Grouping comes before padding, unless the fill is zeros.
  let value = comma && !zero ? group(digits, Infinity) : digits;
  const length = prefix.length + value.length + suffix.length;
  let padding = width !== undefined && length < width ? fill.repeat(width - length) : '';
  if (comma && zero) {
    value = group(padding + value, padding.length ? width! - suffix.length : Infinity);
    padding = '';
  }
  switch (spec.align) {
    case '<':
      return prefix + value + suffix + padding;
    case '=':
      return prefix + padding + value + suffix;
    case '^': {
      const half = padding.length >> 1;
      return padding.slice(0, half) + prefix + value + suffix + padding.slice(half);
    }
    default:
      return padding + prefix + value + suffix;
  }
}

/**
 * d3's `format(specifier)`: the formatter, or `undefined` for a specifier d3 rejects (d3
 * throws `invalid format`).
 */
export function d3Format(specifier: string): ((value: number) => string) | undefined {
  const spec = parse(specifier);
  if (!spec) return undefined;
  const p = precisionOf(spec);
  if (spec.type === 'c') {
    const [prefix, suffix] = affixes(spec);
    return (input) => padded(spec, [prefix, '', String(input) + suffix]);
  }
  return (input) => padded(spec, numberParts(spec, p, input));
}
