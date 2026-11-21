/**
 * The v12 theme-variable reader the theme specs compare against (D151: v12 is the oracle).
 * Importing this module loads the oracle.
 */
import { loadOracle } from './oracle.ts';

/** The part of `mermaid@12` the theme specs use. */
interface V12 {
  mermaidAPI: {
    reset(): void;
    initialize(config: object): void;
    getConfig(): { theme?: string; themeVariables: Record<string, unknown> };
  };
  parse(text: string): Promise<unknown>;
}

await loadOracle();
/** The oracle's `mermaid@12`. */
export const v12 = ((await import('mermaid-v12')) as unknown as { default: V12 }).default;

/** v12's resolved theme variables of `theme`, with author `themeVariables`; v12 is reset after. */
export function v12Vars(theme: string, themeVariables?: object): Record<string, unknown> {
  v12.mermaidAPI.reset();
  v12.mermaidAPI.initialize(themeVariables ? { theme, themeVariables } : { theme });
  const vars = { ...v12.mermaidAPI.getConfig().themeVariables };
  v12.mermaidAPI.reset();
  return vars;
}
