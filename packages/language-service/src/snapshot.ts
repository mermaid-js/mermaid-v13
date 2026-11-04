/**
 * The document snapshot (DESIGN §4.5, D90): one text, parsed once, with every query computed
 * on first call and memoised. A snapshot never changes; `update` makes a new one.
 *
 * Adding a query (completion #32, front-matter config #33): write a feature module that takes
 * the {@link DocumentContext} and add a method here that memoises it under its own key.
 */
import type { AstId, Diagnostic, LanguageFacet, Range } from '@mermaid-js/core/parser-kit';
import { astAt, astRanges } from './ast.ts';
import type { DocumentContext } from './context.ts';
import { diagnostics } from './diagnostics.ts';
import { foldingRanges } from './folding.ts';
import { deepFreeze } from './freeze.ts';
import type { FoldingRange } from './folding.ts';
import { semanticTokens } from './semantic-tokens.ts';
import type { SemanticToken } from './semantic-tokens.ts';
import { definition, occurrences, prepareRename, references, rename } from './symbols.ts';
import type { Occurrence, PrepareRenameResult, RenameResult } from './symbols.ts';

export class DocumentSnapshot {
  private readonly cache = new Map<string, unknown>();

  /**
   * @param context - What the queries read.
   * @param version - Increases with every `update` of the service.
   * @param pending - Set while the detected type's facet loads: resolves to a snapshot of the
   *   same text that has the facet (or, when loading failed, the info diagnostic).
   */
  constructor(
    readonly context: DocumentContext,
    readonly version: number,
    readonly pending?: Promise<DocumentSnapshot>
  ) {}

  get uri(): string {
    return this.context.uri;
  }

  get text(): string {
    return this.context.text;
  }

  /** The detected v12 type (`flowchart-v2`); `undefined` when v12 does not know it. */
  get type(): string | undefined {
    return this.context.entry?.type;
  }

  /** The facet serving this text; `undefined` while it loads or for a type with none. */
  get facet(): LanguageFacet | undefined {
    return this.context.facet;
  }

  /** Memoise `compute` under `key` for this snapshot. */
  protected memo<T>(key: string, compute: () => T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const value = deepFreeze(compute());
    this.cache.set(key, value);
    return value;
  }

  private occurrences(): readonly Occurrence[] {
    return this.memo('occurrences', () => occurrences(this.context));
  }

  /** Preprocess and parse diagnostics as they are (D91). */
  diagnostics(): readonly Diagnostic[] {
    // Copies: the parse result's own diagnostics stay as the parser left them.
    return this.memo('diagnostics', () =>
      diagnostics(this.context, this.pending !== undefined).map((d) => structuredClone(d))
    );
  }

  /** The range of the first definition of the name at `offset` (D92). */
  definition(offset: number): Range | undefined {
    return definition(this.occurrences(), offset);
  }

  /** Every occurrence of the name at `offset` in its namespace, in source order. */
  references(offset: number, includeDeclaration = true): readonly Range[] {
    return references(this.occurrences(), offset, includeDeclaration);
  }

  /** The name at `offset` and its range, or why it cannot be renamed. */
  prepareRename(offset: number): PrepareRenameResult {
    return prepareRename(this.context, this.occurrences(), offset);
  }

  /** Edits renaming the name at `offset` everywhere, or why not (invalid id, clash). */
  rename(offset: number, newName: string): RenameResult {
    return rename(this.context, this.occurrences(), offset, newName);
  }

  foldingRanges(): readonly FoldingRange[] {
    return this.memo('folding', () => foldingRanges(this.context));
  }

  /** Sorted, non-overlapping tokens; types and modifiers from {@link SEMANTIC_TOKEN_LEGEND}. */
  semanticTokens(): readonly SemanticToken[] {
    return this.memo('semanticTokens', () => semanticTokens(this.context, this.occurrences()));
  }

  /** AST ids around `offset`, innermost first (R-LANG-6). */
  astAt(offset: number): readonly AstId[] {
    return Object.freeze(astAt(this.context.result?.ast, offset));
  }

  /** The source range of an AST id. */
  rangeOf(id: AstId): Range | undefined {
    const r = this.memo('astRanges', () => astRanges(this.context.result?.ast)).get(id);
    return r && Object.freeze({ start: r.start, end: r.end });
  }
}
