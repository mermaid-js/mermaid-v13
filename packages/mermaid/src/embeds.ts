/**
 * Embedded diagrams (ADR-15): what every parse needs, blocks or not. The block pass itself
 * (`block-pass.ts`) is a chunk of its own, loaded by the first prepare, render or parse of a
 * text with a block, so a document without one never fetches it.
 */
import { NotLoadedError, type Warning } from '@mermaid-js/core';
import type { ResolvedConfig, ResolvedSite } from '@mermaid-js/core/config';
import type { EmbeddedBlock, ParseResult } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { Analysis } from './analysis-cache.ts';
import type { BlockDeps, BlockPass, DrawBlocks, LazyBlocks } from './block-pass.ts';
import type { Snapshot } from './config-snapshot.ts';

/** The blocks a parse lists, none when the type hosts none. */
export function embedsOf(parse: ParseResult<unknown>): readonly EmbeddedBlock[] {
  return parse.embeds ?? [];
}

/**
 * `pre` without the directives (and their diagnostics) inside the bodies of `parse`'s blocks:
 * a `%%{init}%%` in a block configures the block, not its host. `pre` itself when none is.
 */
export function outsideBlocks(
  pre: PreprocessResult,
  parse: ParseResult<unknown>
): PreprocessResult {
  const bodies = embedsOf(parse);
  if (bodies.length === 0) return pre;
  const inside = ({ range }: { range: { start: number } }) =>
    bodies.some((b) => range.start >= b.offset && range.start < b.offset + b.text.length);
  if (!pre.directives.some(inside)) return pre;
  return {
    ...pre,
    directives: pre.directives.filter((d) => !inside(d)),
    diagnostics: pre.diagnostics.filter((d) => !inside(d)),
  };
}

/**
 * The host of a block being parsed, as the block pass hands it to `analyse`: the host's
 * resolved config, and the rules that keep the block to its own diagram sections.
 */
export interface BlockHost {
  readonly config: ResolvedConfig;
  /** The block's config layers (front matter, directives) with its diagram sections only. */
  layers<T extends object>(
    front: T | undefined,
    directives: readonly T[],
    site: Pick<ResolvedSite, 'tree' | 'sections'>,
    warn: (w: Warning) => void
  ): { front: T | undefined; directives: T[] };
  /** The block's config resolved over the host's: its theme, drawn at its natural size. */
  resolve(config: ResolvedConfig, sections: readonly string[]): ResolvedConfig;
}

/**
 * The binder maker of a draw with no block: the interactions run's afterMount on the mount
 * element, when it mounts. A draw with blocks takes the block pass's.
 */
function plainMounter<R extends { readonly svg: string }>(
  run: { readonly mounts: boolean; afterMount(el: Element, result: R): void } | undefined
) {
  return (result: R): ((el: Element) => void) | undefined =>
    run?.mounts ? (el) => run.afterMount(el, result) : undefined;
}

/** The block pass of one API object, loaded for the first text with a block (D553). */
export interface BlockLoader {
  /** Loads the pass when `a` has blocks (a folded one too); undefined when it has none. */
  load(a: Analysis): Promise<BlockPass | undefined>;
  /**
   * The pass for a draw of `a`: undefined when `a` has no block, and `NOT_LOADED` when no
   * prepare, render or parse of a text with a block has loaded it yet (R-API-2).
   */
  of(a: Analysis): BlockPass | undefined;
  /** The types of `a`'s folded blocks by id (#670), as {@link of} finds the pass. */
  foldedType(a: Analysis, s: Snapshot): ((id: string) => string | undefined) | undefined;
  /** One draw's block lookup and binder maker; without blocks, no lookup and the run's binder. */
  lookup<E>(
    blocks: DrawBlocks<E> | undefined,
    prefix: () => string,
    warn: (w: Warning) => void
  ): LazyBlocks<E>;
}

export function blockLoader(deps: BlockDeps): BlockLoader {
  let loading: Promise<BlockPass> | undefined;
  let pass: BlockPass | undefined;
  const has = (a: Analysis): boolean => embedsOf(a.prepared.parse).length > 0;
  function of(a: Analysis): BlockPass | undefined {
    if (!has(a)) return undefined;
    if (!pass) throw new NotLoadedError([{ kind: 'diagram', name: 'mermaid blocks' }]);
    return pass;
  }
  return {
    async load(a) {
      if (!has(a)) return undefined;
      loading ??= import('./block-pass.ts').then((m) => m.blockPass(deps));
      return (pass ??= await loading);
    },
    of,
    foldedType: (a, s) => of(a)?.foldedType(a, s),
    lookup: (blocks, prefix, warn) =>
      (blocks && pass?.lazy(blocks, prefix, warn)) ?? { embed: undefined, mounter: plainMounter },
  };
}
