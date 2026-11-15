import { leanOf, MermaidError, type DiagramParseContext } from '@mermaid-js/core';
import type { LeanParseResult, ParseResult } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { Prepared } from './api-types.ts';
import type { IntegratorOptions, Snapshot } from './config-snapshot.ts';
import type { AnyPlugin, Detected } from './registry.ts';

/**
 * What the API object keeps of one parsed text (DESIGN §3 steps 1–4): its parse is lean
 * (DESIGN §4.2), whatever the plugin returned, so a cached text holds no AST.
 */
export interface Analysis {
  readonly detected: Detected;
  readonly plugin: AnyPlugin;
  readonly prepared: Omit<Prepared, 'parse'> & { readonly parse: LeanParseResult<unknown> };
  /** The front-matter title, for text output (D82). */
  readonly title?: string;
  /** The author's config layers (`initialize`, front matter, directives), for line hops (D537). */
  readonly sources: readonly (Readonly<Record<string, unknown>> | undefined)[];
  /** Whether its SVG draws write `data-ast` (`RenderContext.dataAst`). */
  readonly dataAst: boolean;
  /**
   * The text parsed again in full, for a call that reads the AST (`prepare()`, text output, a
   * `postParse` hook). It is the caller's: nothing keeps it.
   */
  readonly full: () => ParseResult<unknown>;
}

/** An analysis, with the full parse when the call that made it parsed in full. */
export interface Parsed {
  readonly analysis: Analysis;
  readonly full?: ParseResult<unknown>;
}

/**
 * Whether an analysis's SVG draws write `data-ast` (R-PARSE-8): as the integrator says
 * (`output.dataAst`); unset, for a plugin that parses lean only when an extension reads the AST
 * (`postParse`), and always for one that does not (its parse always gives the ids).
 */
export function dataAstOf(
  options: Readonly<IntegratorOptions>,
  plugin: AnyPlugin,
  readsAst: boolean
): boolean {
  return options.output?.dataAst ?? (!plugin.leanParse || readsAst);
}

/**
 * The parse step of an analysis (DESIGN §3 step 3): lean when `lean` (DESIGN §4.2), with the
 * model's AST ids when `astIds`. A lean parse with an error is parsed again in full, so the
 * error and its diagnostics are the full parse's. Returns the lean view of the result, and the
 * result itself when it is full.
 */
export function parseStep(
  plugin: AnyPlugin,
  text: string,
  ctx: DiagramParseContext,
  lean: boolean,
  astIds: boolean
): { readonly lean: LeanParseResult<unknown>; readonly full?: ParseResult<unknown> } {
  let parse = plugin.parse(text, lean ? { ...ctx, lean, astIds } : ctx);
  if (parse.lean && parse.diagnostics.some((d) => d.severity === 'error'))
    parse = plugin.parse(text, ctx);
  return parse.lean ? { lean: parse } : { lean: leanOf(parse), full: parse };
}

/** `plugin`'s full parse: a plugin gives a lean one only when asked for it. */
export function fullParse(
  plugin: AnyPlugin,
  text: string,
  ctx: DiagramParseContext
): ParseResult<unknown> {
  const parse = plugin.parse(text, ctx);
  if (parse.lean) throw new MermaidError('INTERNAL', `${plugin.id}: lean parse unasked`);
  return parse;
}

/** What `detect` found. */
export interface Detection {
  readonly detected: Detected;
  readonly pre: PreprocessResult;
}

interface CacheEntry<A> {
  readonly snap: Snapshot;
  readonly analysis: A;
}

const CACHE_SIZE = 32;

/** The analyses of recent texts, each valid only for the snapshot it was made with. */
export class AnalysisCache<A> {
  private readonly entries = new Map<string, CacheEntry<A>>();

  get(text: string, snap: Snapshot): A | undefined {
    const hit = this.entries.get(text);
    return hit && hit.snap === snap ? hit.analysis : undefined;
  }

  set(text: string, snap: Snapshot, analysis: A): void {
    this.entries.delete(text);
    this.entries.set(text, { snap, analysis });
    if (this.entries.size > CACHE_SIZE) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void {
    this.entries.clear();
  }
}
