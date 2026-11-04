/**
 * The document snapshot (DESIGN §4.5, D90): one text, parsed once, with every query computed
 * on first call and memoised. A snapshot never changes; `update` makes a new one.
 *
 * Adding a query: write a feature module that takes the {@link DocumentContext} and add a
 * method here that memoises it under its own key. `completions` and `hover` ask the front
 * matter first, then the facet (completion.ts and hover.ts).
 */
import type {
  AstId,
  CompletionItem,
  Diagnostic,
  DocumentView,
  Hover,
  LanguageFacet,
  Range,
} from '@mermaid-js/core/parser-kit';
import { astAt, astRanges } from './ast.ts';
import { completions } from './completion.ts';
import { configDiagnostics, frontMatterTree } from './config/front-matter.ts';
import type { FrontMatterTree } from './config/front-matter.ts';
import type { DocumentContext } from './context.ts';
import { diagnostics } from './diagnostics.ts';
import { foldingRanges } from './folding.ts';
import { hover } from './hover.ts';
import { deepFreeze } from './freeze.ts';
import type { FoldingRange } from './folding.ts';
import { lineFoldingRanges, lineSemanticTokens } from './lines.ts';
import type { LineFoldingRange, LineSemanticToken } from './lines.ts';
import { LineIndex } from '@mermaid-js/core/parser-kit';
import { semanticTokens } from './semantic-tokens.ts';
import type { SemanticToken } from './semantic-tokens.ts';
import { definition, occurrences, prepareRename, references, rename } from './symbols.ts';
import type { Occurrence, PrepareRenameResult, RenameResult } from './symbols.ts';

/**
 * A copy of a diagnostic that shares nothing with the parse result, which the snapshot then
 * freezes (no `structuredClone`: the package stays free of runtime globals, R-LANG-1).
 */
function copyDiagnostic(d: Diagnostic): Diagnostic {
  const out: Diagnostic = {
    severity: d.severity,
    code: d.code,
    message: d.message,
    range: { start: d.range.start, end: d.range.end },
  };
  if (d.expected) out.expected = [...d.expected];
  if (d.related)
    out.related = d.related.map((r) => ({
      message: r.message,
      range: { start: r.range.start, end: r.range.end },
    }));
  return out;
}

/**
 * One text, parsed once (D90): every query is computed on first call and memoised, and what
 * it returns is frozen. A snapshot never changes; `update` makes a new one. Offsets are
 * UTF-16 offsets into `text`.
 */
export interface DocumentSnapshot {
  readonly uri: string;
  readonly text: string;
  /** Increases with every `update` of the service. */
  readonly version: number;
  /** The detected v12 type (`flowchart-v2`); `undefined` when v12 does not know it. */
  readonly type: string | undefined;
  /** The facet serving this text; `undefined` for a type with none, not preloaded, or failed. */
  readonly facet: LanguageFacet | undefined;
  /** Preprocess and parse diagnostics (D91), with the front-matter config warnings (D96). */
  diagnostics(): readonly Diagnostic[];
  /** Completion items at `offset`: front matter (D96), else the facet's probe (D95). */
  completions(offset: number): readonly CompletionItem[];
  /** Hover at `offset`: a front-matter key's schema docs (D96), else the facet's (D93). */
  hover(offset: number): Hover | undefined;
  /** The range of the first definition of the name at `offset` (D92). */
  definition(offset: number): Range | undefined;
  /** Every occurrence of the name at `offset` in its namespace, in source order. */
  references(offset: number, includeDeclaration?: boolean): readonly Range[];
  /** The name at `offset` and its range, or why it cannot be renamed. */
  prepareRename(offset: number): PrepareRenameResult;
  /** Edits renaming the name at `offset` everywhere, or why not (invalid id, clash). */
  rename(offset: number, newName: string): RenameResult;
  /** Folding ranges as offsets (statement kind, `frontMatter`, `directive`). */
  foldingRanges(): readonly FoldingRange[];
  /** The folding ranges by line, as editors fold them (closing `end`/`---` line visible). */
  lineFoldingRanges(): readonly LineFoldingRange[];
  /** Sorted, non-overlapping tokens; types and modifiers from `SEMANTIC_TOKEN_LEGEND`. */
  semanticTokens(): readonly SemanticToken[];
  /** The semantic tokens cut per line, as Monaco, LSP and CodeMirror show them. */
  lineSemanticTokens(): readonly LineSemanticToken[];
  /** The text's line table (offsets ↔ 0-based line and UTF-16 column). */
  lines(): LineIndex;
  /** AST ids around `offset`, innermost first (R-LANG-6). */
  astAt(offset: number): readonly AstId[];
  /** The source range of an AST id. */
  rangeOf(id: AstId): Range | undefined;
}

/**
 * Freeze what a facet could change behind the snapshot's queries before it sees the parse
 * (D90), cheaply enough for the R-LANG-4 cycle: the result object, its diagnostics (deep; the
 * `diagnostics` query reads them lazily), the symbol and statement arrays and the token, AST
 * and model objects (shallow). Symbol and statement elements need no freezing: the snapshot
 * has already copied them into its occurrences and folding ranges before a facet is called.
 * The AST below its root and the token typed arrays stay as they are (freezing the AST costs
 * about 1.2 ms on the 50k bench text; typed arrays cannot be frozen): a facet treats its
 * `DocumentView` as read-only (LanguageFacet contract).
 */
function freezeForFacet<T extends object>(result: T): T {
  const r = result as unknown as Record<string, unknown>;
  deepFreeze(r.diagnostics);
  for (const key of ['symbols', 'statements', 'tokens', 'ast', 'model']) {
    const v = r[key];
    if (typeof v === 'object' && v !== null && !ArrayBuffer.isView(v)) Object.freeze(v);
  }
  return Object.freeze(result);
}

class Snapshot implements DocumentSnapshot {
  readonly #context: DocumentContext;
  readonly #version: number;
  readonly #cache = new Map<string, unknown>();
  #lineIndex: LineIndex | undefined;
  #view: DocumentView | undefined;

  constructor(context: DocumentContext, version: number) {
    this.#context = context;
    this.#version = version;
  }

  /** The service's context of `doc` (specs and the service only; not exported). */
  static contextOf(doc: DocumentSnapshot): DocumentContext {
    return (doc as Snapshot).#context;
  }

  get version(): number {
    return this.#version;
  }

  /**
   * The parse as a facet reads it, frozen once (only with a facet and its parse). The
   * occurrences and folding ranges are copied out of it first, so nothing a facet does to a
   * symbol or statement element reaches them.
   */
  #facetView(): DocumentView | undefined {
    const { result, text } = this.#context;
    if (!result) return undefined;
    if (this.#view) return this.#view;
    this.#occurrences();
    this.foldingRanges();
    return (this.#view = Object.freeze({ text, result: freezeForFacet(result) }));
  }

  get uri(): string {
    return this.#context.uri;
  }

  get text(): string {
    return this.#context.text;
  }

  /** The detected v12 type (`flowchart-v2`); `undefined` when v12 does not know it. */
  get type(): string | undefined {
    return this.#context.entry?.type;
  }

  /** The facet serving this text; `undefined` for a type with none, or not preloaded. */
  get facet(): LanguageFacet | undefined {
    return this.#context.facet;
  }

  /** Memoise `compute` under `key` for this snapshot. */
  #memo<T>(key: string, compute: () => T): T {
    if (this.#cache.has(key)) return this.#cache.get(key) as T;
    const value = deepFreeze(compute());
    this.#cache.set(key, value);
    return value;
  }

  #occurrences(): readonly Occurrence[] {
    return this.#memo('occurrences', () => occurrences(this.#context));
  }

  /** The front matter's YAML node tree (tree mode), read once. */
  #frontMatter(): FrontMatterTree | undefined {
    return this.#memo('frontMatter', () => frontMatterTree(this.#context));
  }

  /**
   * Preprocess and parse diagnostics as they are (D91), with the front-matter config warnings
   * (D96) placed in source order among them.
   */
  diagnostics(): readonly Diagnostic[] {
    // Copies: the parse result's own diagnostics stay as the parser left them.
    return this.#memo('diagnostics', () => {
      const own = diagnostics(this.#context).map(copyDiagnostic);
      // Both lists are in source order: merge, own first on a tie.
      const config = configDiagnostics(this.#context, this.#frontMatter());
      const out: Diagnostic[] = [];
      let i = 0;
      for (const w of config) {
        while (i < own.length && own[i]!.range.start <= w.range.start) out.push(own[i++]!);
        out.push(w);
      }
      return [...out, ...own.slice(i)];
    });
  }

  /**
   * Completion items at `offset`: front-matter keys and values (D96), else the facet's from a
   * parse with `probe: offset` (D95). Not memoised: each offset parses once.
   */
  completions(offset: number): readonly CompletionItem[] {
    return deepFreeze(completions(this.#context, this.#frontMatter(), offset));
  }

  /** Hover at `offset`: a front-matter key's schema docs (D96), else the facet's (D93). */
  hover(offset: number): Hover | undefined {
    const h = hover(this.#context, this.#frontMatter(), this.#occurrences(), offset, () =>
      this.#facetView()
    );
    return h && deepFreeze(h);
  }

  /** The range of the first definition of the name at `offset` (D92). */
  definition(offset: number): Range | undefined {
    return definition(this.#occurrences(), offset);
  }

  /** Every occurrence of the name at `offset` in its namespace, in source order. */
  references(offset: number, includeDeclaration = true): readonly Range[] {
    return references(this.#occurrences(), offset, includeDeclaration);
  }

  /** The name at `offset` and its range, or why it cannot be renamed. */
  prepareRename(offset: number): PrepareRenameResult {
    return prepareRename(this.#context, this.#occurrences(), offset);
  }

  /** Edits renaming the name at `offset` everywhere, or why not (invalid id, clash). */
  rename(offset: number, newName: string): RenameResult {
    return rename(this.#context, this.#occurrences(), offset, newName);
  }

  foldingRanges(): readonly FoldingRange[] {
    return this.#memo('folding', () => foldingRanges(this.#context));
  }

  /** The folding ranges by line, as editors fold them (closing `end`/`---` line visible). */
  lineFoldingRanges(): readonly LineFoldingRange[] {
    return this.#memo('lineFolding', () =>
      lineFoldingRanges(this.text, this.foldingRanges(), this.lines())
    );
  }

  /** Sorted, non-overlapping tokens; types and modifiers from {@link SEMANTIC_TOKEN_LEGEND}. */
  semanticTokens(): readonly SemanticToken[] {
    return this.#memo('semanticTokens', () => semanticTokens(this.#context, this.#occurrences()));
  }

  /** The semantic tokens cut per line, as Monaco, LSP and CodeMirror show them. */
  lineSemanticTokens(): readonly LineSemanticToken[] {
    return this.#memo('lineSemanticTokens', () =>
      lineSemanticTokens(this.text, this.semanticTokens(), { index: this.lines() })
    );
  }

  /** The text's line table. */
  lines(): LineIndex {
    return (this.#lineIndex ??= deepFreeze(new LineIndex(this.text)));
  }

  /** AST ids around `offset`, innermost first (R-LANG-6). */
  astAt(offset: number): readonly AstId[] {
    return Object.freeze(astAt(this.#context.result?.ast, offset));
  }

  /** The source range of an AST id. */
  rangeOf(id: AstId): Range | undefined {
    const r = this.#memo('astRanges', () => astRanges(this.#context.result?.ast)).get(id);
    return r && Object.freeze({ start: r.start, end: r.end });
  }
}

/** A new snapshot of `context` (the service's `update`). */
export function createSnapshot(context: DocumentContext, version: number): DocumentSnapshot {
  return new Snapshot(context, version);
}

/** The context behind `doc`: for the specs, never exported from the package. */
export const contextOf = (doc: DocumentSnapshot): DocumentContext => Snapshot.contextOf(doc);
