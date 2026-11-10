// Test helper: draws a block diagram as text through the `./ascii` entry, as the pipeline hands
// it over: the parse's model and AST, and a config with the `ascii` section (and, for the
// `block.padding` specs, a `block` section). The hook draws from the model alone.
import type { Warning } from '@mermaid-js/core';
import { ascii, type BlockAsciiContext } from '../ascii.ts';
import { parseBlock } from '../parser/index.ts';

export interface DrawOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  maxWidth?: number;
  /** The `block` section (`padding`). */
  block?: Record<string, unknown>;
}

export interface Drawn {
  text: string;
  warnings: Warning[];
}

/** `src` as text, with the warnings the hook gave. */
export function draw(src: string, options: DrawOptions = {}): Drawn {
  const { block, ...section } = options;
  const parse = parseBlock(src);
  const warnings: Warning[] = [];
  const ctx: BlockAsciiContext = {
    config: { ascii: section, ...(block ? { block } : {}) } as never,
    warn: (w) => void warnings.push(w),
    ast: parse.ast,
  };
  return { text: ascii(parse.model, undefined, ctx), warnings };
}

/** Draws and returns the text alone. */
export const text = (src: string, options?: DrawOptions): string => draw(src, options).text;

/** The source of `lines`, one statement a line after the `block` header. */
export const block = (...lines: string[]): string =>
  ['block', ...lines.map((l) => `  ${l}`)].join('\n');
