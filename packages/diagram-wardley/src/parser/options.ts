/** What a Wardley parse takes. */
import type { ParseOptions } from '@mermaid-js/core/parser-kit';
import type { WardleyLimitOptions } from './limits.ts';

export interface WardleyParseOptions extends ParseOptions, WardleyLimitOptions {}
