/**
 * Ported from the approaches harness (`src/shared/normalize.ts`). Mermaid-only look and layout
 * settings (handDrawn, ELK) have no v13 M1 equivalent, so they are stripped from every
 * renderer's input and all renderers are compared on the same dagre-style layout.
 */
const patterns: RegExp[] = [
  // Front matter: drop the whole line.
  /^[ \t]*look[ \t]*:[ \t]*['"]?handDrawn['"]?[ \t]*(?:\r?\n|$)/gm,
  /^[ \t]*layout[ \t]*:[ \t]*['"]?elk[\w.-]*['"]?[ \t]*(?:\r?\n|$)/gm,
  // JSON in %%{init}%% directives: drop the key with its leading or trailing comma.
  /,\s*["']look["']\s*:\s*["']handDrawn["']/g,
  /["']look["']\s*:\s*["']handDrawn["']\s*,?\s*/g,
  /,\s*["']layout["']\s*:\s*["']elk[\w.-]*["']/g,
  /["']layout["']\s*:\s*["']elk[\w.-]*["']\s*,?\s*/g,
];

export function stripMermaidOnlyConfig(source: string): { source: string; changed: boolean } {
  let out = source;
  for (const re of patterns) out = out.replace(re, '');
  return { source: out, changed: out !== source };
}
