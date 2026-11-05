// cspell:words kepano
// Measurer selection and the browser canvas measurer (DESIGN §5.1, R-TEXT-5, R-TEXT-7).
// Core never imports this module; `mermaid` injects the selected measurer into the render
// context, so core stays free of the DOM (R-ARCH-1).
// Based on Pele's canvasMeasurer (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
import {
  SMALLER,
  Style,
  tableMeasurer,
  type FontKey,
  type Measurer,
  type StyleBits,
  type VerticalMetrics,
} from '@mermaid-js/core/text';

interface Context2D {
  font: string;
  measureText(text: string): {
    width: number;
    fontBoundingBoxAscent?: number;
    fontBoundingBoxDescent?: number;
  };
}

// The parts of document.fonts used here (`size` is in lib DOM.Iterable, not lib DOM).
interface FontSet {
  readonly size: number;
  check(font: string, text?: string): boolean;
}

/** Entries kept per CSS font; at this size the font's cache is cleared whole (D201). */
const MAX_CACHED = 20000;
const MONO_FAMILY = 'monospace';

function context(): Context2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(1, 1).getContext('2d') as Context2D | null;
    }
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      return document.createElement('canvas').getContext('2d');
    }
  } catch {
    return null;
  }
  return null;
}

function fontSet(): FontSet | undefined {
  return typeof document === 'undefined'
    ? undefined
    : (document.fonts as unknown as FontSet | undefined);
}

// Whether the canvas has the font itself rather than a fallback while it loads. A font that
// cannot be checked counts as loaded.
function hasFont(fonts: FontSet | undefined, font: string, text: string): boolean {
  try {
    return fonts?.check(font, text) ?? true;
  } catch {
    return true;
  }
}

function cssFont(font: FontKey, style: StyleBits): string {
  const size = style & (Style.Sub | Style.Sup) ? font.size / SMALLER : font.size;
  return (
    (style & Style.Italic ? 'italic ' : '') +
    (style & Style.Bold ? 'bold' : String(font.weight)) +
    ` ${size}px ` +
    (style & Style.Mono ? MONO_FAMILY : font.family)
  );
}

/** One CSS font's caches. */
interface Entry {
  readonly css: string;
  readonly cache: Map<string, number>;
  /** Widths of single ASCII characters; NaN where not measured yet. */
  readonly ascii: Float64Array;
}

/** The canvas measurer, with the once-per-render check of the font set (D201). */
export type CanvasMeasurer = Measurer & { sync(): void };

/**
 * A measurer that measures whole strings with canvas `measureText`, or null where there is
 * no canvas. Widths are cached per CSS font (20k entries, then cleared whole; single ASCII
 * characters in a typed array), except while `document.fonts.check` says the font is not
 * loaded yet. `sync()`, called once per render, drops every cache when `document.fonts.size`
 * has changed, so a late-loading web font is re-measured. A render measures synchronously, so
 * the set cannot change inside one.
 */
export function canvasMeasurer(): CanvasMeasurer | null {
  const ctx = context();
  if (!ctx) return null;
  // The CSS font string and its caches per (FontKey object, style bits); a new object with an
  // equal font finds the same entry by its string.
  const byFont = new WeakMap<FontKey, (Entry | undefined)[]>();
  const byCss = new Map<string, Entry>();
  let vertical = new WeakMap<FontKey, VerticalMetrics>();
  const verticalByCss = new Map<string, VerticalMetrics>();
  let faces = fontSet()?.size;
  let current = '';

  const entry = (font: FontKey, style: StyleBits): Entry => {
    let byStyle = byFont.get(font);
    if (!byStyle) byFont.set(font, (byStyle = []));
    let e = byStyle[style];
    if (!e) {
      const css = cssFont(font, style);
      e = byCss.get(css);
      if (!e) {
        e = { css, cache: new Map(), ascii: new Float64Array(128).fill(NaN) };
        byCss.set(css, e);
      }
      byStyle[style] = e;
    }
    return e;
  };

  return {
    id: 'canvas',
    sync() {
      const size = fontSet()?.size;
      if (size === faces) return;
      faces = size;
      for (const e of byCss.values()) {
        e.cache.clear();
        e.ascii.fill(NaN);
      }
      verticalByCss.clear();
      vertical = new WeakMap();
    },
    width(text, font, style) {
      const e = entry(font, style);
      const single = text.length === 1 ? text.charCodeAt(0) : 128;
      if (single < 128) {
        const w = e.ascii[single]!;
        if (w === w) return w; // not NaN
      } else {
        const hit = e.cache.get(text);
        if (hit !== undefined) return hit;
      }
      if (e.css !== current) ctx.font = current = e.css;
      const w = ctx.measureText(text).width;
      if (hasFont(fontSet(), e.css, text)) {
        if (single < 128) e.ascii[single] = w;
        else {
          if (e.cache.size >= MAX_CACHED) e.cache.clear();
          e.cache.set(text, w);
        }
      } else {
        // The context resolved the font to a fallback when `font` was set; set it again
        // next time so the loaded face is picked up (Chromium keeps the fallback otherwise).
        current = '';
      }
      return w;
    },
    metrics(font) {
      const hit = vertical.get(font);
      if (hit) return hit;
      const css = cssFont(font, 0);
      let out = verticalByCss.get(css);
      if (!out) {
        if (css !== current) ctx.font = current = css;
        const m = ctx.measureText('Mg');
        if (m.fontBoundingBoxAscent === undefined || m.fontBoundingBoxDescent === undefined) {
          return tableMeasurer.metrics(font);
        }
        out = {
          ascent: m.fontBoundingBoxAscent,
          descent: m.fontBoundingBoxDescent,
          lineHeight: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent,
        };
        if (!hasFont(fontSet(), css, 'Mg')) {
          current = '';
          return out;
        }
        verticalByCss.set(css, out);
      }
      vertical.set(font, out);
      return out;
    },
  };
}

let shared: CanvasMeasurer | undefined;

export interface MeasurerOptions {
  /** An integrator-supplied measurer. `deterministic` overrides it (R-TEXT-7). */
  measurer?: Measurer;
  /** Forces the table measurer in every environment, even over `measurer` (R-TEXT-7). */
  deterministic?: boolean;
}

/**
 * The measurer for a render: the table measurer when `deterministic`, else the integrator's,
 * else the shared canvas measurer in a browser (checked against the font set once, here),
 * else the table measurer.
 */
export function selectMeasurer(options: MeasurerOptions = {}): Measurer {
  if (options.deterministic) return tableMeasurer;
  if (options.measurer) return options.measurer;
  shared ??= canvasMeasurer() ?? undefined;
  shared?.sync();
  return shared ?? tableMeasurer;
}
