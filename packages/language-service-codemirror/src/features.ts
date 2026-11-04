/**
 * The service features as CodeMirror extensions (D98). Each needs {@link mermaidService} in
 * the same state. The state-only functions (`lintDiagnostics`, `completionSource`, `hoverAt`,
 * `foldAt`, `semanticTokenRanges`, `cursorAst`) are the mapping; the extensions wire them in.
 */
import { autocompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { codeFolding, foldService } from '@codemirror/language';
import { linter } from '@codemirror/lint';
import type { Diagnostic as LintDiagnostic } from '@codemirror/lint';
import { Facet, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { AstId, CompletionKind, Range } from '@mermaid-js/language-service';
import { mermaidLanguageDefinition } from './language.ts';
import { renderMarkdown } from './markdown.ts';
import { mermaidSnapshot } from './service.ts';

/** Milliseconds between the last edit and the diagnostics (and semantic tokens) update (D98). */
export const DIAGNOSTICS_DELAY = 150;

const clamp = (state: EditorState, at: number) => Math.max(0, Math.min(at, state.doc.length));

// --- diagnostics -------------------------------------------------------------------------

/** The service's diagnostics as CodeMirror lint diagnostics (`source` = the code). */
export function lintDiagnostics(state: EditorState): LintDiagnostic[] {
  const doc = mermaidSnapshot(state);
  if (!doc) return [];
  return doc.diagnostics().map((d) => ({
    from: clamp(state, d.range.start),
    to: clamp(state, Math.max(d.range.start, d.range.end)),
    severity: d.severity,
    source: d.code,
    message: d.message,
  }));
}

export interface DiagnosticsOptions {
  /** Debounce in milliseconds; {@link DIAGNOSTICS_DELAY} by default. */
  readonly delay?: number;
}

/** Diagnostics through `@codemirror/lint`, debounced ~150 ms (D98). */
export function mermaidDiagnostics(options: DiagnosticsOptions = {}): Extension {
  return linter((view) => lintDiagnostics(view.state), {
    delay: options.delay ?? DIAGNOSTICS_DELAY,
  });
}

// --- completion --------------------------------------------------------------------------

/** CodeMirror's completion `type` (its icon) for each service kind. */
const TYPE: Readonly<Record<CompletionKind, string>> = {
  property: 'property',
  value: 'enum',
  keyword: 'keyword',
  node: 'variable',
  subgraph: 'namespace',
  class: 'class',
  constant: 'constant',
  operator: 'keyword',
  shape: 'type',
};

/** A completion source over the service's `completions(offset)`. */
export function completionSource(context: CompletionContext): CompletionResult | null {
  const doc = mermaidSnapshot(context.state);
  if (!doc) return null;
  const items = doc.completions(context.pos);
  if (items.length === 0) return null;
  // Items normally share the replaced range; one that does not applies its own.
  const { start: from, end: to } = items[0]!.range;
  const options = items.map((item): Completion => {
    const own = item.range.start !== from || item.range.end !== to;
    return {
      label: item.label,
      type: TYPE[item.kind],
      ...(item.detail === undefined ? {} : { detail: item.detail }),
      ...(item.documentation === undefined
        ? {}
        : { info: () => renderMarkdown(item.documentation!) }),
      apply: own
        ? (view: EditorView) =>
            view.dispatch({
              changes: { from: item.range.start, to: item.range.end, insert: item.insertText },
              selection: { anchor: item.range.start + item.insertText.length },
            })
        : item.insertText,
    };
  });
  // Typing more word characters only narrows the list: CodeMirror filters it without asking
  // the service again (each ask is a probe re-parse).
  return { from, to: Math.max(to, context.pos), options, validFor: /^\w*$/ };
}

/**
 * Autocompletion from the service, as the Mermaid language's completion source: it applies
 * only where `mermaidLanguage()` is the language (with `mermaidService()` in the state).
 */
export function mermaidCompletion(): Extension {
  return [mermaidLanguageDefinition.data.of({ autocomplete: completionSource }), autocompletion()];
}

// --- hover ---------------------------------------------------------------------------------

/** The service's hover at `pos`: its range and its Markdown. */
export function hoverAt(
  state: EditorState,
  pos: number
): { from: number; to: number; markdown: string } | undefined {
  const hover = mermaidSnapshot(state)?.hover(pos);
  if (!hover) return undefined;
  return {
    from: clamp(state, hover.range.start),
    to: clamp(state, hover.range.end),
    markdown: hover.contents,
  };
}

/** Hover tooltips from the service. */
export function mermaidHover(): Extension {
  return hoverTooltip((view, pos) => {
    const hover = hoverAt(view.state, pos);
    if (!hover) return null;
    return {
      pos: hover.from,
      end: hover.to,
      above: true,
      create: () => {
        const dom = renderMarkdown(hover.markdown);
        dom.classList.add('cm-mermaid-hover');
        return { dom };
      },
    };
  });
}

// --- folding -------------------------------------------------------------------------------

/** New folding ranges from a settled snapshot. */
const setFolds = StateEffect.define<readonly Range[]>();

/**
 * The folding ranges of the last settled snapshot, mapped through every edit since. The fold
 * gutter asks for each visible line after every keystroke; answering from here keeps typing
 * free of parses. The ranges are refreshed after the debounce.
 */
const foldField = StateField.define<readonly Range[]>({
  create: (state) =>
    mermaidSnapshot(state)
      ?.foldingRanges()
      .map((f) => f.range) ?? [],
  update: (ranges, tr) => {
    for (const e of tr.effects) if (e.is(setFolds)) return e.value;
    if (!tr.docChanged) return ranges;
    return ranges.map((r) => ({
      start: tr.changes.mapPos(r.start, 1),
      end: Math.max(tr.changes.mapPos(r.start, 1), tr.changes.mapPos(r.end, -1)),
    }));
  },
});

/**
 * The fold that starts on the line `[lineStart, lineEnd]`: from the line's end to the end of
 * the range's second-to-last line, so the closing line (`end`, `---`) stays visible. Reads
 * the debounced ranges when {@link mermaidFolding} is installed, else the current snapshot.
 */
export function foldAt(
  state: EditorState,
  lineStart: number,
  lineEnd: number
): { from: number; to: number } | null {
  const ranges =
    state.field(foldField, false) ??
    mermaidSnapshot(state)
      ?.foldingRanges()
      .map((f) => f.range);
  if (!ranges) return null;
  for (const range of ranges) {
    if (range.start < lineStart || range.start > lineEnd) continue;
    const last = state.doc.lineAt(clamp(state, range.end));
    const first = state.doc.lineAt(lineStart);
    if (last.number <= first.number + 1) continue;
    return { from: lineEnd, to: state.doc.line(last.number - 1).to };
  }
  return null;
}

/**
 * Folding from the service's folding ranges, with CodeMirror's fold state. The ranges follow
 * edits by mapping and are re-read from the service after the debounce.
 */
export function mermaidFolding(options: DiagnosticsOptions = {}): Extension {
  const delay = options.delay ?? DIAGNOSTICS_DELAY;
  const refresh = ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | undefined;
      constructor(private readonly view: EditorView) {}
      update(update: ViewUpdate) {
        if (!update.docChanged) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          const doc = mermaidSnapshot(this.view.state);
          if (doc)
            this.view.dispatch({ effects: setFolds.of(doc.foldingRanges().map((f) => f.range)) });
        }, delay);
      }
      destroy() {
        clearTimeout(this.timer);
      }
    }
  );
  return [foldField, refresh, foldService.of(foldAt), codeFolding()];
}

// --- semantic tokens -----------------------------------------------------------------------

/** One semantic token as a class span: `cm-mermaid-<type>` plus `cm-mermaid-<modifier>`s. */
export interface SemanticTokenRange {
  readonly from: number;
  readonly to: number;
  readonly className: string;
}

/**
 * The semantic tokens that overlap any of `ranges` (e.g. the view's visible ranges), each
 * once and in document order, even when it spans several of them.
 */
export function semanticTokenRanges(
  state: EditorState,
  ranges: readonly { readonly from: number; readonly to: number }[]
): SemanticTokenRange[] {
  const doc = mermaidSnapshot(state);
  if (!doc) return [];
  const out: SemanticTokenRange[] = [];
  for (const t of doc.semanticTokens()) {
    if (t.range.end <= t.range.start) continue;
    if (!ranges.some((r) => t.range.end > r.from && t.range.start < r.to)) continue;
    out.push({
      from: clamp(state, t.range.start),
      to: clamp(state, t.range.end),
      className: [t.type, ...t.modifiers].map((n) => `cm-mermaid-${n}`).join(' '),
    });
  }
  return out;
}

function decorate(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const t of semanticTokenRanges(view.state, view.visibleRanges)) {
    builder.add(t.from, t.to, Decoration.mark({ class: t.className }));
  }
  return builder.finish();
}

/**
 * Semantic-token decorations. After an edit the old ones are mapped through it and the new
 * ones follow after the same debounce as the diagnostics, so typing never waits for a parse.
 */
export function mermaidSemanticTokens(options: DiagnosticsOptions = {}): Extension {
  const delay = options.delay ?? DIAGNOSTICS_DELAY;
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private timer: ReturnType<typeof setTimeout> | undefined;
      constructor(private readonly view: EditorView) {
        this.decorations = decorate(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
          clearTimeout(this.timer);
          this.timer = setTimeout(() => {
            this.timer = undefined;
            this.decorations = decorate(this.view);
            this.view.dispatch({}); // redraw with the new set
          }, delay);
        } else if (update.viewportChanged && this.timer === undefined) {
          // While an edit is pending the debounced rebuild covers the new viewport too.
          this.decorations = decorate(update.view);
        }
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
    { decorations: (p) => p.decorations }
  );
  return [plugin, semanticTheme];
}

const semanticTheme = EditorView.baseTheme({
  '.cm-mermaid-node': { color: '#1f6feb' },
  '.cm-mermaid-subgraph': { color: '#8250df' },
  '.cm-mermaid-class': { color: '#bc4c00' },
  '.cm-mermaid-definition': { fontWeight: 'bold' },
  '.cm-mermaid-hover': { padding: '4px 8px', maxWidth: '40em' },
  '.cm-mermaid-hover p': { margin: '2px 0' },
});

// --- cursor → AstId ------------------------------------------------------------------------

/** The AST ids under the main cursor, innermost first (the root left out). */
export function cursorAst(state: EditorState): readonly AstId[] {
  return mermaidSnapshot(state)?.astAt(state.selection.main.head) ?? [];
}

/** Called with the AST ids under the cursor whenever they change. */
export type CursorAstListener = (ids: readonly AstId[], view: EditorView) => void;

/**
 * The cursor → AstId facet (D98): register listeners with `cursorAstListener.of(fn)`. A move
 * reports at once; after an edit the ids follow the debounced re-parse.
 */
export const cursorAstListener = Facet.define<CursorAstListener>();

const sameIds = (a: readonly AstId[], b: readonly AstId[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

function cursorAstPlugin(delay: number): Extension {
  return ViewPlugin.fromClass(
    class {
      private last: readonly AstId[] = [];
      private timer: ReturnType<typeof setTimeout> | undefined;
      constructor(private readonly view: EditorView) {
        this.report();
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.report(), delay);
        } else if (update.selectionSet && this.timer === undefined) {
          this.report();
        }
      }
      private report() {
        this.timer = undefined;
        const listeners = this.view.state.facet(cursorAstListener);
        if (listeners.length === 0) return;
        const ids = cursorAst(this.view.state);
        if (sameIds(ids, this.last)) return;
        this.last = ids;
        for (const listen of listeners) listen(ids, this.view);
      }
      destroy() {
        clearTimeout(this.timer);
      }
    }
  );
}

/** Report the AST ids under the cursor to `listener` (and any other `cursorAstListener`). */
export function mermaidCursorAst(
  listener?: CursorAstListener,
  options: DiagnosticsOptions = {}
): Extension {
  return [
    listener ? cursorAstListener.of(listener) : [],
    cursorAstPlugin(options.delay ?? DIAGNOSTICS_DELAY),
  ];
}

/** Move the cursor to the start of AST node `id` (e.g. a clicked `[data-ast]` element). */
export function selectAst(view: EditorView, id: AstId): boolean {
  const range = mermaidSnapshot(view.state)?.rangeOf(id);
  if (!range) return false;
  const anchor = clamp(view.state, range.start);
  view.dispatch({ selection: { anchor }, scrollIntoView: true });
  view.focus();
  return true;
}
