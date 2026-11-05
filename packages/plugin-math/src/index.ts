/**
 * The math extension plugin, `@mermaid-js/plugin-math` (D175, D178, R-API-2): TeX between `$$`
 * delimiters in a label is typeset by MathJax into plain `<path>` glyphs, drawn as an inline
 * box (D177).
 *
 * This entry is tiny. It claims the `$$` delimiter and declares one resource, `math "tex"`.
 * `prepare()` asks for that resource only when a string in the parsed diagram has a `$$…$$` pair,
 * and only then imports the engine (`./engine.ts`, MathJax and its TeX font), so a page without
 * math never downloads MathJax. `renderSync` before the engine has loaded throws
 * `NotLoadedError` naming it; with `placeholders` it draws the TeX as written, with a warning.
 * TeX that does not parse is also drawn as written, with one `MATH_ERROR` warning.
 *
 * Text output (`format: 'ascii'`) draws no inline boxes, so it never asks for the engine (D179).
 */
import type { ExtensionPlugin, Resource } from '@mermaid-js/core';
import type { ParseResult } from '@mermaid-js/core/parser-kit';
import { Style, type InlineProvider, type InlineRequest } from '@mermaid-js/core/text';
import type * as EngineModule from './engine.ts';

type Engine = typeof EngineModule;

/** The resource this plugin loads: the MathJax engine. */
const TEX: Resource = { kind: 'math', name: 'tex' };

let engine: Engine | undefined;
let loading: Promise<void> | undefined;
/**
 * Whether the last `missing()` reported the engine. The API asks `missing()` right before it
 * draws, synchronously, so while drawing this says whether the render already knows the engine
 * is missing (and, with `placeholders`, has warned `PLACEHOLDER` for it).
 */
let reported = false;

function load(): Promise<void> {
  loading ??= import('./engine.ts').then(
    (e) => {
      engine = e;
    },
    (error: unknown) => {
      loading = undefined; // a failed download may be retried
      throw error;
    }
  );
  return loading;
}

function hasPair(text: string): boolean {
  const at = text.indexOf('$$');
  return at >= 0 && text.includes('$$', at + 2);
}

/** Whether any string in `value` (an AST or a model) has a `$$…$$` pair. */
function mentionsMath(value: unknown): boolean {
  const seen = new Set<object>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === 'string') {
      if (hasPair(v)) return true;
    } else if (typeof v === 'object' && v !== null && !seen.has(v)) {
      seen.add(v);
      if (v instanceof Map) for (const [k, x] of v) stack.push(k, x);
      else if (v instanceof Set) for (const x of v) stack.push(x);
      else for (const x of Object.values(v)) stack.push(x);
    }
  }
  return false;
}

/** Per parse (the API caches it with the analysis), so `renderSync` does not walk it again. */
const withMath = new WeakMap<object, boolean>();

function needsMath(parse: ParseResult<unknown>): boolean {
  let found = withMath.get(parse);
  if (found === undefined) {
    found = mentionsMath(parse.ast) || mentionsMath(parse.model);
    withMath.set(parse, found);
  }
  return found;
}

/** Width in px of characters the TeX font lacks, in the label's font (MathJax draws them as text). */
function measureWith(request: InlineRequest) {
  return (text: string, italic: boolean, bold: boolean): number =>
    request.measurer.width(
      text,
      bold ? { ...request.font, weight: Math.max(request.font.weight, 700) } : request.font,
      (bold ? Style.Bold : 0) | (italic ? Style.Italic : 0)
    );
}

const provider: InlineProvider = {
  open: '$$',
  close: '$$',
  box(tex, request) {
    if (!engine) {
      // With placeholders the API has warned about the engine already; otherwise this is label
      // text the parse does not hold, so prepare() could not know to load the engine.
      if (!reported)
        request.warn({
          code: 'MATH_NOT_RENDERED',
          message:
            'Math ($$…$$) is not rendered: the math engine has not loaded, so the TeX is shown as written. Call prepare() or preload({ math: true }) first.',
        });
      return undefined;
    }
    try {
      return engine.typeset(tex, {
        ex: request.ex,
        em: request.font.size,
        measure: measureWith(request),
      });
    } catch (error) {
      if (!(error instanceof engine.MathError)) throw error;
      request.warn({
        code: 'MATH_ERROR',
        message: `$$${tex}$$ is not valid TeX (${error.message}): it is shown as written.`,
      });
      return undefined;
    }
  },
};

/** The math extension: register it with `registerExternalDiagrams([math])`. */
export const math: ExtensionPlugin = {
  id: 'math',
  inline: [provider],
  resources: {
    provides: [TEX],
    missing(parse, { format }) {
      reported = format === 'svg' && engine === undefined && needsMath(parse);
      return reported ? [TEX] : [];
    },
    load,
  },
};

export default math;
