// cspell:words cnds cnis cnbw cnlw cnaw
import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutCynefin, type CynefinLayout } from './layout/index.ts';
import type { CynefinModel } from './model.ts';
import { detectCynefin, parseCynefin, type CynefinParseResult } from './parser/index.ts';
import { renderCynefin } from './render/index.ts';
import { cynefinLabels } from './labels.ts';

/**
 * The cynefin plugin (DESIGN §12.1, spec #423): `layoutKind: 'custom'` with its own
 * `CynefinLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's fixed canvas (D361); `render` writes the whole `<svg>` document. SVG only (D320). The
 * manifest and the generated config defaults land in T5 (#469).
 *
 * `theme` is the diagram's own theme table (D331, spec #414 T0a): v12's fifteen
 * `themeVariables.cynefin.*` variables as flat `cynefin…` names under the nested section
 * `cynefin` (D335, D540), keyed by theme trait, never by theme name:
 *
 * - **light** (every family, the fallback): v12 `default`'s five backgrounds and cliff, the
 *   boundaries and arrows in `lineColor`, text in `textColor`, labels in `primaryTextColor`;
 *   the five lengths as tokens of every family. This is v12 in `default`, `neutral` and `base`.
 * - **dark** (a dark theme's own trait, not the author's `darkMode`, as v12's literals did not
 *   follow it): v12 `dark`'s five backgrounds and cliff, over the light entries.
 *
 * The redux and neo families take the same entries (`fallback: 'classic'`), so they derive from
 * their own colours and their dark themes take the dark entry (R-THEME-11), where v12 left them
 * on `default`'s literals. v12 `forest`'s own literals have no trait to key them by; forest takes
 * the light entry (T5's oracle lists it, D333(b), D541).
 */
export const cynefin = {
  id: 'cynefin',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectCynefin(text),
  parse: (text: string, ctx: DiagramParseContext): CynefinParseResult =>
    parseCynefin(text, { preprocessed: ctx.preprocessed }),
  labels: cynefinLabels,
  layout: (model: CynefinModel, ctx: RenderContext): CynefinLayout => layoutCynefin(model, ctx),
  render: (model: CynefinModel, layout: CynefinLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderCynefin(model, layout, ctx, w),
  theme: {
    section: 'cynefin',
    vars: {
      cynefinComplexBg: { alias: 'cnx', kind: 'color', nested: 'complexBg' },
      cynefinComplicatedBg: { alias: 'cnp', kind: 'color', nested: 'complicatedBg' },
      cynefinChaoticBg: { alias: 'cnh', kind: 'color', nested: 'chaoticBg' },
      cynefinClearBg: { alias: 'cnc', kind: 'color', nested: 'clearBg' },
      cynefinConfusionBg: { alias: 'cnf', kind: 'color', nested: 'confusionBg' },
      cynefinBoundaryColor: { alias: 'cnb', kind: 'color', nested: 'boundaryColor' },
      cynefinCliffColor: { alias: 'cnl', kind: 'color', nested: 'cliffColor' },
      cynefinArrowColor: { alias: 'cna', kind: 'color', nested: 'arrowColor' },
      cynefinTextColor: { alias: 'cnt', kind: 'color', nested: 'textColor' },
      cynefinLabelColor: { alias: 'cnn', kind: 'color', nested: 'labelColor' },
      cynefinDomainFontSize: { alias: 'cnds', kind: 'length', nested: 'domainFontSize' },
      cynefinItemFontSize: { alias: 'cnis', kind: 'length', nested: 'itemFontSize' },
      cynefinBoundaryWidth: { alias: 'cnbw', kind: 'length', nested: 'boundaryWidth' },
      cynefinCliffWidth: { alias: 'cnlw', kind: 'length', nested: 'cliffWidth' },
      cynefinArrowWidth: { alias: 'cnaw', kind: 'length', nested: 'arrowWidth' },
    },
    rules: {
      // v12 theme-default.js :298-315.
      light: {
        cynefinComplexBg: '#E8F5E9',
        cynefinComplicatedBg: '#E3F2FD',
        cynefinChaoticBg: '#FBE9E7',
        cynefinClearBg: '#FFF8E1',
        cynefinConfusionBg: '#F3E5F5',
        cynefinBoundaryColor: 'lineColor',
        cynefinCliffColor: '#8B0000',
        cynefinArrowColor: 'lineColor',
        cynefinTextColor: 'textColor',
        cynefinLabelColor: 'primaryTextColor',
      },
    },
    families: {
      classic: {
        tokens: {
          cynefinDomainFontSize: 16,
          cynefinItemFontSize: 12,
          cynefinBoundaryWidth: 2,
          cynefinCliffWidth: 4,
          cynefinArrowWidth: 2,
        },
        // v12 theme-dark.js :265-282.
        dark: {
          values: {
            cynefinComplexBg: '#1B5E20',
            cynefinComplicatedBg: '#0D47A1',
            cynefinChaoticBg: '#BF360C',
            cynefinClearBg: '#F57F17',
            cynefinConfusionBg: '#4A148C',
            cynefinCliffColor: '#FF6B6B',
          },
        },
      },
      redux: { fallback: 'classic' },
      neo: { fallback: 'classic' },
    },
  },
} satisfies DiagramPlugin<CynefinModel, CynefinLayout>;
