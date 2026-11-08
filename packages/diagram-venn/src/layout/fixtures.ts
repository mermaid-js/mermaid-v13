/**
 * Layout inputs for the venn layout specs (spec #429 T3), produced by the v13 parser (T2 #488)
 * as the plugin produces them. The corpus itself is swept by conformance's
 * `src/venn/layout-corpus.spec.ts` (a diagram package reads no files); here are the cases the
 * specs work by hand, and a measurer with round numbers.
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import type { VennModel } from '../model.ts';
import { parseVenn } from '../parser/index.ts';

/** The model of `src` as the plugin builds it, and the source's front-matter `venn` config. */
export function parsed(src: string): {
  model: VennModel;
  config: Readonly<Record<string, unknown>>;
} {
  const pre = preprocess(src);
  const { model } = parseVenn(src, { preprocessed: pre });
  const config = (pre.frontMatter?.config?.venn ?? {}) as Readonly<Record<string, unknown>>;
  return { model, config };
}

/** A diagram from its lines after the `venn-beta` header. */
export const venn = (...lines: string[]): string => ['venn-beta', ...lines].join('\n');

/** Every character 10 px wide at any size, lines 1.2 em high: round numbers for wrapping. */
export const gridMeasurer: Measurer = {
  id: 'venn-grid',
  width: (text) => [...text].length * 10,
  metrics: (font) => ({ ascent: font.size, descent: font.size / 5, lineHeight: font.size * 1.2 }),
};
