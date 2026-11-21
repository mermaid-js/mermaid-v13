/**
 * The theme a diagram's own text picks, read from core's preprocess result rather than guessed
 * with a regex: the gallery (Node) and the Dev Explorer (browser) both ask it.
 */
import { preprocess } from '@mermaid-js/core/preprocess';

/** The last `init` directive's `theme`, else the front matter config's; undefined when neither. */
export function sourceTheme(source: string): string | undefined {
  const pre = preprocess(source);
  let theme: unknown = pre.frontMatter?.config?.theme;
  for (const d of pre.directives) {
    const args = d.kind === 'init' ? d.args : undefined;
    if (typeof args === 'object' && args !== null && 'theme' in args) theme = args.theme;
  }
  return typeof theme === 'string' ? theme : undefined;
}
