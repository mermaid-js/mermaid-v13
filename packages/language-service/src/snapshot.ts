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
import { semanticTokens } from './semantic-tokens.ts';
import type { SemanticToken } from './semantic-tokens.ts';
import { definition, occurrences, prepareRename, references, rename } from './symbols.ts';
import type { Occurrence, PrepareRenameResult, RenameResult } from './symbols.ts';

export class DocumentSnapshot {
  private readonly cache = new Map<string, unknown>();

  /**
   * @param context - What the queries read.
   * @param version - Increases with every `update` of the service.
   */
  constructor(
    readonly context: DocumentContext,
    readonly version: number
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

  /** The facet serving this text; `undefined` for a type with none, or not preloaded. */
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

  /** The front matter's YAML node tree (tree mode), read once. */
  private frontMatter(): FrontMatterTree | undefined {
    return this.memo('frontMatter', () => frontMatterTree(this.context));
  }

  /**
   * Preprocess and parse diagnostics as they are (D91), with the front-matter config warnings
   * (D96) placed in source order among them.
   */
  diagnostics(): readonly Diagnostic[] {
    // Copies: the parse result's own diagnostics stay as the parser left them.
    return this.memo('diagnostics', () => {
      const own = diagnostics(this.context).map((d) => structuredClone(d));
      // Both lists are in source order: merge, own first on a tie.
      const config = configDiagnostics(this.context, this.frontMatter());
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
    return deepFreeze(completions(this.context, this.frontMatter(), offset));
  }

  /** Hover at `offset`: a front-matter key's schema docs (D96), else the facet's (D93). */
  hover(offset: number): Hover | undefined {
    const h = hover(this.context, this.frontMatter(), this.occurrences(), offset);
    return h && deepFreeze(h);
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
