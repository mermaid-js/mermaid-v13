/** What a Wardley parse takes. */
import type { ParseOptions } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { WardleyLimitOptions } from './limits.ts';

export interface WardleyParseOptions extends ParseOptions, WardleyLimitOptions {
  /** The preprocess result for this text; computed (and its diagnostics kept) when absent. */
  preprocessed?: PreprocessResult;
}
