/**
 * What the venn tests lay out with (the layout specs, the conformance layout corpus, parity
 * and stress): a source parsed as the plugin parses it with its front-matter `venn` config, the
 * `default` theme, and a render context with the table measurer and warnings collected.
 */
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { VennLayoutContext } from './layout/index.ts';
import type { VennModel } from './model.ts';
import { parseVenn } from './parser/index.ts';

/** A source parsed: its model, its diagnostics, and its front matter's `venn` config. */
export interface ParsedVenn {
  readonly model: VennModel;
  readonly diagnostics: readonly Diagnostic[];
  readonly config: Readonly<Record<string, unknown>>;
}

/** `src` preprocessed and parsed as the plugin does, with its front matter's `venn` config. */
export function parsedVenn(src: string): ParsedVenn {
  const preprocessed = preprocess(src);
  const { model, diagnostics } = parseVenn(src, { preprocessed });
  const config = (preprocessed.frontMatter?.config?.venn ?? {}) as Readonly<
    Record<string, unknown>
  >;
  return { model, diagnostics, config };
}

/** The `default` theme (venn's table is #495's). */
export async function vennTestTheme(): Promise<Theme> {
  return createTheme(await loadTheme('default'));
}

/**
 * A layout context over `theme` with the `venn` config section `section`; warnings go to
 * `warnings`.
 */
export function vennTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  warnings: Warning[] = [],
  measurer: Measurer = tableMeasurer
): VennLayoutContext {
  return {
    config: { venn: section } as unknown as ResolvedConfig,
    theme,
    measurer,
    warn: (w) => warnings.push(w),
  };
}
