import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * State's theme table (`DiagramPlugin.theme`, D331, spec #414 T3): its composite state fills by
 * family.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  // v12 theme-base.js. The classic themes write the nested body differently from one another
  // (default `#f0f0f0`, neutral `#f4f4f4`, base `tertiaryColor`), so it reads the shared input
  // as each theme wrote it (`inline()`, D332), byte for byte. The composite body is the canvas
  // fill, which `default` pins where v12 keeps `#ffffff` under a `background` override (D656);
  // in the classic family the title strip is the node fill, which `default` pins likewise.
  rules: {
    light: {
      compositeBackground: 'canvasBkg',
      compositeTitleBackground: 'mainBkg',
      altBackground: 'inline(nestedBkg)',
      stateLabelColor: 'nodeTextColor',
      compositeTitleColor: 'titleColor',
    },
  },
  families: {
    // v12 theme-*.js set `stateLabelColor` to `stateBkg || primaryTextColor` before `stateBkg`
    // was set, so every classic theme drew state text and composite titles in
    // `primaryTextColor` (D638, #827). An author's `stateLabelColor` still recolours both.
    classic: {
      rules: {
        compositeTitleBackground: 'canvasNodeBkg',
        stateLabelColor: 'primaryTextColor',
        compositeTitleColor: 'stateLabelColor',
      },
    },
    // v12 theme-redux*.js pin the title strip and the nested body; the dark ones the body too
    // (#192, D126), not clusterBkg or background.
    redux: {
      values: { compositeTitleBackground: '#f9f9fb', altBackground: '#f9f9fb' },
      dark: {
        values: {
          compositeBackground: '#16141f',
          compositeTitleBackground: '#16141f',
          altBackground: '#16141f',
        },
      },
    },
    // v12 theme-neo.js keeps the classic `#f0f0f0`; on neo-dark that hid the `#cccccc` lines of
    // a nested composite, so it takes `#404040` (D189).
    neo: {
      values: { altBackground: '#f0f0f0' },
      dark: { values: { altBackground: '#404040' } },
    },
  },
};
