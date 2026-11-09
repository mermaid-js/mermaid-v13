/**
 * Flowchart owns no theme variables: every one it reads is core's. This file holds what the
 * theme tools need from it (`tools/gen-config/src/theme-packages.ts`).
 */

/**
 * Names the sources build at run time, which the theme usedBy scan for literals can't see:
 * `padsOf` in render/prepare.ts reads `${shape}PaddingX` / `${shape}PaddingY`.
 */
export const DYNAMIC_READS: readonly string[] = [
  'node',
  'stadium',
  'hexagon',
  'subroutine',
  'cylinder',
  'lean',
  'odd',
].flatMap((shape) => [`${shape}PaddingX`, `${shape}PaddingY`]);
