import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: pie reads them all. */
const PIE: readonly string[] = ['pie'];

/**
 * The pie chart's theme variables (#325, v12 names; spec #414 T1, D331), moved out of core with
 * their aliases: the slot colours `pie1`–`pie12`, the texts, the strokes and the slice opacity.
 * `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  pie1: { alias: 'pi1', kind: 'color', usedBy: PIE },
  pie2: { alias: 'pi2', kind: 'color', usedBy: PIE },
  pie3: { alias: 'pi3', kind: 'color', usedBy: PIE },
  pie4: { alias: 'pi4', kind: 'color', usedBy: PIE },
  pie5: { alias: 'pi5', kind: 'color', usedBy: PIE },
  pie6: { alias: 'pi6', kind: 'color', usedBy: PIE },
  pie7: { alias: 'pi7', kind: 'color', usedBy: PIE },
  pie8: { alias: 'pi8', kind: 'color', usedBy: PIE },
  pie9: { alias: 'pi9', kind: 'color', usedBy: PIE },
  pie10: { alias: 'pi10', kind: 'color', usedBy: PIE },
  pie11: { alias: 'pi11', kind: 'color', usedBy: PIE },
  pie12: { alias: 'pi12', kind: 'color', usedBy: PIE },
  pieTitleTextSize: { alias: 'pts', kind: 'length', usedBy: PIE },
  pieTitleTextColor: { alias: 'ptc', kind: 'color', usedBy: PIE },
  pieSectionTextSize: { alias: 'pss', kind: 'length', usedBy: PIE },
  pieSectionTextColor: { alias: 'psc', kind: 'color', usedBy: PIE },
  pieLegendTextSize: { alias: 'pls', kind: 'length', usedBy: PIE },
  pieLegendTextColor: { alias: 'plc', kind: 'color', usedBy: PIE },
  pieStrokeColor: { alias: 'pkc', kind: 'color', usedBy: PIE },
  pieStrokeWidth: { alias: 'pkw', kind: 'length', usedBy: PIE },
  pieOuterStrokeColor: { alias: 'poc', kind: 'color', usedBy: PIE },
  pieOuterStrokeWidth: { alias: 'pow', kind: 'length', usedBy: PIE },
  pieOpacity: { alias: 'pop', kind: 'opacity', usedBy: PIE },
};

/**
 * Names the sources build at run time, which the theme usedBy scan for literals can't see:
 * `paints` in render/paint.ts reads the slot colours `pie${slot + 1}`.
 */
export const DYNAMIC_READS: readonly string[] = Array.from({ length: 12 }, (_, i) => `pie${i + 1}`);
