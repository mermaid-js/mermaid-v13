import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Block's theme table (`DiagramPlugin.theme`, D331, spec #795 T4): one paint flag by family,
 * never by theme name (D152). Every colour it draws is core's shared vocabulary.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: { light: {} },
  families: {
    // v12 classic: block's `.node .cluster` rule paints a composite with the cluster colours
    // (#771).
    classic: { tokens: { blockCompositeClusterPaint: true } },
    // v12 `look: neo` (the redux and neo themes): the neo rule's leaf paint wins on composites.
    redux: { tokens: { blockCompositeClusterPaint: false } },
    neo: { fallback: 'redux' },
  },
};
