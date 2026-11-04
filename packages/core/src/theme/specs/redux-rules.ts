/**
 * Colours the redux family derives differently from the classic themes (D152). Shared by the
 * four redux colour specs. `classText`: v12's redux theme files set it to `textColor`, the
 * classic ones to `primaryTextColor` (the shared rule). ER rows have no fill of their own in
 * v12 neo, so they show the entity's; the zero circle takes the node fill (`zero_or_one_neo`).
 */
import type { ThemeRuleTable } from '../spec.ts';

export const REDUX_RULES: ThemeRuleTable = {
  classText: 'textColor',
  rowOdd: 'mainBkg',
  rowEven: 'mainBkg',
  erMarkerFill: 'mainBkg',
};
