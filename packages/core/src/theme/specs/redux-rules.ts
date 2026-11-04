/**
 * Colours the redux family derives differently from the classic themes (D152). Shared by the
 * four redux colour specs. `classText`: v12's redux theme files set it to `textColor`, the
 * classic ones to `primaryTextColor` (the shared rule).
 */
import type { ThemeRuleTable } from '../spec.ts';

export const REDUX_RULES: ThemeRuleTable = {
  classText: 'textColor',
};
