// Inline boxes in labels (DESIGN §5.3, D177): an extension registers a provider for a delimiter
// pair or a pattern (D293), and label layout hands it each span, which comes back as a measured
// box drawn on the line's baseline. Math (`$$…$$`) is the first user; icons (`fa:fa-car`) the next.
import type { InlineBox, LabelBoxSpan } from '../svg/writer.ts';
import type { FontKey, Measurer, VerticalMetrics } from './measurer.ts';

/** What a provider gets with each span: the label's font and how to size against it. */
export interface InlineRequest {
  readonly font: FontKey;
  readonly measurer: Measurer;
  /** `measurer.metrics(font)`. */
  readonly metrics: VerticalMetrics;
  /** One ex in px. The tables carry no x-height, so this is half the font size (the MathJax default). */
  readonly ex: number;
  /**
   * The render's warnings, for a provider that declines a span it cannot draw (bad TeX), so the
   * span shown as written is not silent. The same code and message are given once per render.
   */
  readonly warn: Warn;
}

/**
 * Boxes for one kind of span: a delimiter pair ({@link InlinePairProvider}) or a pattern
 * ({@link InlinePatternProvider}). Registered synchronously (an extension's `inline`); `box` runs
 * during layout, so it is synchronous too. A provider whose engine loads later returns
 * `undefined` until it has loaded (the span is then drawn as written); its extension asks for
 * the engine as a resource, so `prepare()` loads it first (R-API-2). Of every provider's next
 * span, the one that starts first wins; on a tie, the first registered.
 */
export type InlineProvider = InlinePairProvider | InlinePatternProvider;

/** Boxes for a delimiter pair (`$$…$$`). */
export interface InlinePairProvider {
  readonly open: string;
  readonly close: string;
  readonly pattern?: undefined;
  /** Lays out `source`, the text between the delimiters, or declines with `undefined`. */
  box(source: string, request: InlineRequest): InlineBox | undefined;
}

/**
 * Boxes for every match of a pattern (`fa:fa-car`, D293). Its flags are kept except `g`, `y` and
 * `m`; an empty match is no span.
 */
export interface InlinePatternProvider {
  readonly pattern: RegExp;
  readonly open?: undefined;
  readonly close?: undefined;
  /** Lays out `source`, the whole match, or declines with `undefined`. */
  box(source: string, request: InlineRequest): InlineBox | undefined;
}

/** A warning sink, as `RenderContext.warn`. */
type Warn = (warning: { readonly code: string; readonly message: string }) => void;

/** One render's providers and its once-per-render warnings, for `LabelOptions.inline`. */
export interface InlineSpans {
  /**
   * Replaces each span a provider boxes with a placeholder character (U+FDD0 + its index) and
   * returns the boxes, or `undefined` when the label has none.
   */
  extract(
    raw: string,
    font: FontKey,
    measurer: Measurer
  ): { readonly source: string; readonly boxes: readonly LabelBoxSpan[] } | undefined;
  /**
   * Whether this render has warned that `feature`'s spans (`'math'`, `'icon'`) are not drawn: its
   * not-rendered warning (`MATH_NOT_RENDERED`, `ICON_NOT_RENDERED`, from core or a provider) or
   * `ASCII_DROPPED`. Not set by a provider's other warnings (`MATH_ERROR`) or the API's
   * `PLACEHOLDER`.
   */
  notRendered(feature: string): boolean;
}

/** A feature core knows: the spans it takes, by delimiter pair or by pattern. */
type Feature = (
  | { readonly open: string; readonly close: string; readonly pattern?: undefined }
  | { readonly pattern: RegExp; readonly open?: undefined; readonly close?: undefined }
) & {
  /** The warning a label with such a span gives when no provider claims it. */
  readonly code: string;
  readonly message: string;
  /** The `ASCII_DROPPED` feature text output names for it (D179), and its message. */
  readonly feature: string;
  readonly ascii: string;
};

/**
 * Spans core knows a feature for. A pair is claimed by a provider of the same `open`; a pattern
 * match by a pattern provider that matches all of it, so with an icons extension core is quiet
 * and the extension warns about icons it cannot draw (D291).
 */
const FEATURES: readonly Feature[] = [
  {
    open: '$$',
    close: '$$',
    code: 'MATH_NOT_RENDERED',
    message: 'Math ($$…$$) is not rendered without a math extension: the TeX is shown as written.',
    feature: 'math',
    ascii: 'Text output has no math ($$…$$): the TeX is shown as written.',
  },
  {
    // D296: v12's prefixes plus `fad`, with no left boundary (`sofa:fa-x` matches).
    // cspell:disable-next-line
    pattern: /(fa[bdklrs]?):fa-([\w-]+)/,
    code: 'ICON_NOT_RENDERED',
    message:
      'Icons (fa:fa-…) are not rendered without an icons extension: the text is shown as written.',
    feature: 'icon',
    ascii: 'Text output has no icons (fa:fa-…): the text is shown as written.',
  },
];

/** Placeholders are Unicode non-characters, which never occur in interchange text. */
export const PLACEHOLDER = 0xfdd0;
const MAX_BOXES = 32;
/** Given once per render when a label's spans are shown as written because of the limits above. */
const LIMIT = {
  code: 'INLINE_LIMIT',
  message: `A label has more than ${MAX_BOXES} inline spans, or a character in U+FDD0–U+FDEF: those spans are shown as written.`,
} as const;
const hex = (n: number): string => n.toString(16).padStart(4, '0');
const RE_PLACEHOLDER = new RegExp(
  `[\\u${hex(PLACEHOLDER)}-\\u${hex(PLACEHOLDER + MAX_BOXES - 1)}]`
);

function hasPair(raw: string, open: string, close: string): boolean {
  const at = raw.indexOf(open);
  return at >= 0 && raw.includes(close, at + open.length);
}

/** `pattern` for searching a label: `g` added, `y` and `m` dropped. */
function searching(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, `${pattern.flags.replace(/[gmy]/g, '')}g`);
}

/**
 * The next non-empty match of `re` (a `g` regex) at or after `at`: its start and end. Each match
 * is searched for once per position, so an empty match only moves the search on.
 */
function nextMatch(re: RegExp, raw: string, at: number): readonly [number, number] | undefined {
  re.lastIndex = at;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    if (m[0] !== '') return [m.index, m.index + m[0].length];
    re.lastIndex = m.index + 1;
  }
  return undefined;
}

/** Whether `raw` holds a span of `f`, claimed or not. */
const hasSpan = (f: Feature, raw: string): boolean =>
  f.pattern ? f.pattern.test(raw) : hasPair(raw, f.open, f.close);

/**
 * A provider's next span from `at`: where it starts, where it ends (`next`), and the `source` its
 * provider gets. An open delimiter without a close has no `source`, and `next` just past it.
 */
interface Found {
  readonly provider: InlineProvider;
  readonly start: number;
  readonly next: number;
  readonly source?: string;
}

/** Whether `found` is all of `text`. */
const whole = (found: Found | undefined, text: string): boolean =>
  found?.start === 0 && found.next === text.length;

/** How to find one provider's spans. */
type Finder = (raw: string, at: number) => Found | undefined;

function finder(provider: InlineProvider): Finder {
  if (provider.pattern) {
    const re = searching(provider.pattern);
    return (raw, at) => {
      const m = nextMatch(re, raw, at);
      return m && { provider, start: m[0], next: m[1], source: raw.slice(m[0], m[1]) };
    };
  }
  const { open, close } = provider;
  return (raw, at) => {
    const start = raw.indexOf(open, at);
    if (start < 0) return undefined;
    const from = start + open.length;
    const end = raw.indexOf(close, from);
    if (end < 0) return { provider, start, next: from };
    return { provider, start, next: end + close.length, source: raw.slice(from, end) };
  };
}

/**
 * The inline spans of one render: `providers` in registration order (the span that starts first
 * wins; on a tie, the first registered), and `warn` for the feature warnings, given once per render.
 *
 * Text output (`format: 'ascii'`) draws no boxes, provider or not: every span is shown as
 * written, with one `ASCII_DROPPED` warning per feature (D179).
 */
export function inlineSpans(
  providers: readonly InlineProvider[],
  warn: Warn,
  format: 'svg' | 'ascii' = 'svg'
): InlineSpans {
  if (format === 'ascii') return asWritten(warn);
  const finders = providers.map(finder);
  const patterns = finders.filter((_, i) => providers[i]!.pattern);
  // A pair feature is claimed per render; a pattern feature per match (see FEATURES).
  const missing = FEATURES.flatMap((f): { f: Feature; has: (raw: string) => boolean }[] => {
    if (!f.pattern) {
      const { open, close } = f;
      if (providers.some((p) => p.open === open)) return [];
      return [{ f, has: (raw) => hasPair(raw, open, close) }];
    }
    const re = searching(f.pattern);
    const has = (raw: string): boolean => {
      for (let m = nextMatch(re, raw, 0); m; m = nextMatch(re, raw, m[1])) {
        const text = raw.slice(m[0], m[1]);
        if (!patterns.some((find) => whole(find(text, 0), text))) return true;
      }
      return false;
    };
    return [{ f, has }];
  });
  const warned = new Set<string>();
  const given = new Set<string>();
  const notDrawn = new Set<string>();
  const once: Warn = (w) => {
    for (const f of FEATURES) if (f.code === w.code) notDrawn.add(f.feature);
    const key = `${w.code}\n${w.message}`;
    if (given.has(key)) return;
    given.add(key);
    warn(w);
  };
  const claimed = (text: string): boolean =>
    finders.some((find) => find(text, 0)?.source !== undefined);
  return {
    notRendered: (feature) => notDrawn.has(feature),
    extract(raw, font, measurer) {
      for (const { f, has } of missing) {
        if (!warned.has(f.code) && has(raw)) {
          warned.add(f.code);
          notDrawn.add(f.feature);
          warn({ code: f.code, message: f.message });
        }
      }
      if (providers.length === 0) return undefined;
      if (RE_PLACEHOLDER.test(raw)) {
        if (claimed(raw)) once(LIMIT);
        return undefined;
      }
      let request: InlineRequest | undefined;
      const boxes: LabelBoxSpan[] = [];
      let source = '';
      let at = 0;
      while (boxes.length < MAX_BOXES) {
        let found: Found | undefined;
        for (const find of finders) {
          const f = find(raw, at);
          if (f && (!found || f.start < found.start)) found = f;
        }
        if (!found) break;
        const { provider, start, next } = found;
        if (found.source === undefined) {
          source += raw.slice(at, next);
          at = next;
          continue;
        }
        request ??= {
          font,
          measurer,
          metrics: measurer.metrics(font),
          ex: font.size / 2,
          warn: once,
        };
        const box = provider.box(found.source, request);
        if (box) {
          source += raw.slice(at, start) + String.fromCharCode(PLACEHOLDER + boxes.length);
          const { width, height, baseline, node } = box;
          boxes.push({ kind: 'box', text: raw.slice(start, next), width, height, baseline, node });
        } else {
          source += raw.slice(at, next);
        }
        at = next;
      }
      if (boxes.length === MAX_BOXES && claimed(raw.slice(at))) once(LIMIT);
      if (boxes.length === 0) return undefined;
      return { source: source + raw.slice(at), boxes };
    },
  };
}

/** Text output's spans: none are boxed; the first label with a feature's span warns once. */
function asWritten(warn: (warning: AsciiDropped) => void): InlineSpans {
  const warned = new Set<string>();
  return {
    notRendered: (feature) => warned.has(feature),
    extract(raw) {
      for (const f of FEATURES) {
        if (!warned.has(f.feature) && hasSpan(f, raw)) {
          warned.add(f.feature);
          warn({ code: 'ASCII_DROPPED', feature: f.feature, message: f.ascii });
        }
      }
      return undefined;
    },
  };
}

/** The text-output warning (D82), as `Warning` carries it. */
interface AsciiDropped {
  readonly code: 'ASCII_DROPPED';
  readonly feature: string;
  readonly message: string;
}
