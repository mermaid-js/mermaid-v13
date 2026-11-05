// Inline boxes in labels (DESIGN §5.3, D177): an extension registers a provider for a delimiter
// pair, and label layout hands it each delimited span, which comes back as a measured box drawn
// on the line's baseline. Math (`$$…$$`) is the first user; M4 icons reuse it.
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
 * Boxes for one delimiter pair. Registered synchronously (an extension's `inline`); `box` runs
 * during layout, so it is synchronous too. A provider whose engine loads later returns
 * `undefined` until it has loaded (the span is then drawn as written); its extension asks for
 * the engine as a resource, so `prepare()` loads it first (R-API-2).
 */
export interface InlineProvider {
  readonly open: string;
  readonly close: string;
  /** Lays out `source`, the text between the delimiters, or declines with `undefined`. */
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
}

/**
 * Delimiters core knows a feature for, the warning a label with one gives without it, and the
 * `ASCII_DROPPED` feature text output names for it (D179).
 */
const FEATURES = [
  {
    open: '$$',
    close: '$$',
    code: 'MATH_NOT_RENDERED',
    message: 'Math ($$…$$) is not rendered without a math extension: the TeX is shown as written.',
    feature: 'math',
    ascii: 'Text output has no math ($$…$$): the TeX is shown as written.',
  },
] as const;

/** Placeholders are Unicode non-characters, which never occur in interchange text. */
export const PLACEHOLDER = 0xfdd0;
const MAX_BOXES = 32;
const hex = (n: number): string => n.toString(16).padStart(4, '0');
const RE_PLACEHOLDER = new RegExp(
  `[\\u${hex(PLACEHOLDER)}-\\u${hex(PLACEHOLDER + MAX_BOXES - 1)}]`
);

function hasPair(raw: string, open: string, close: string): boolean {
  const at = raw.indexOf(open);
  return at >= 0 && raw.includes(close, at + open.length);
}

/**
 * The inline spans of one render: `providers` in registration order (the first one wins a
 * delimiter), and `warn` for the feature warnings, given once per render.
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
  const missing = FEATURES.filter((f) => !providers.some((p) => p.open === f.open));
  const warned = new Set<string>();
  const given = new Set<string>();
  const once: Warn = (w) => {
    const key = `${w.code}\n${w.message}`;
    if (given.has(key)) return;
    given.add(key);
    warn(w);
  };
  return {
    extract(raw, font, measurer) {
      for (const f of missing) {
        if (!warned.has(f.code) && hasPair(raw, f.open, f.close)) {
          warned.add(f.code);
          warn({ code: f.code, message: f.message });
        }
      }
      if (providers.length === 0 || RE_PLACEHOLDER.test(raw)) return undefined;
      let request: InlineRequest | undefined;
      const boxes: LabelBoxSpan[] = [];
      let source = '';
      let at = 0;
      while (boxes.length < MAX_BOXES) {
        let provider: InlineProvider | undefined;
        let start = -1;
        for (const p of providers) {
          const s = raw.indexOf(p.open, at);
          if (s >= 0 && (start < 0 || s < start)) [provider, start] = [p, s];
        }
        if (!provider) break;
        const from = start + provider.open.length;
        const end = raw.indexOf(provider.close, from);
        if (end < 0) {
          source += raw.slice(at, from);
          at = from;
          continue;
        }
        const next = end + provider.close.length;
        request ??= {
          font,
          measurer,
          metrics: measurer.metrics(font),
          ex: font.size / 2,
          warn: once,
        };
        const box = provider.box(raw.slice(from, end), request);
        if (box) {
          source += raw.slice(at, start) + String.fromCharCode(PLACEHOLDER + boxes.length);
          const { width, height, baseline, node } = box;
          boxes.push({ kind: 'box', text: raw.slice(start, next), width, height, baseline, node });
        } else {
          source += raw.slice(at, next);
        }
        at = next;
      }
      if (boxes.length === 0) return undefined;
      return { source: source + raw.slice(at), boxes };
    },
  };
}

/** Text output's spans: none are boxed; the first label with a feature's pair warns once. */
function asWritten(warn: (warning: AsciiDropped) => void): InlineSpans {
  const warned = new Set<string>();
  return {
    extract(raw) {
      for (const f of FEATURES) {
        if (!warned.has(f.feature) && hasPair(raw, f.open, f.close)) {
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
