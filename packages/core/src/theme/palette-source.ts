/**
 * The palettes of one render (D258, D545): the theme's lists, with the scale and git palettes it
 * leaves out derived as v12 theme-base does, and the author's checked overrides, whole lists and
 * numbered entries. `theme.ts` reads them through its resolver.
 */
import { checkCssColor, splitTopLevel } from '../svg/style.ts';
import type { SafeColor } from '../svg/types.ts';
import type { ThemeSpec } from './spec.ts';
import { BASE_PLOT } from './specs/palettes.ts';
import { baseScalesFor } from './specs/scales.ts';
import type { ThemeWarning } from './theme.ts';
import { GIT_PALETTE_LIMIT, PALETTE_LIMIT, PALETTE_VARIABLES } from './vocabulary.ts';

const MAX_PALETTE = 64;
/**
 * v12's numbered palette names (`NUMBERED_PALETTES`): `cScale3`, `cScaleInv3`, `cScaleLabel3`,
 * `git3`, `gitInv3`, `gitBranchLabel3`. v12 reads no leading zero, so `cScale05` is an unknown
 * name, ignored (R-CONF-5).
 */
const RE_SLOT = /^(cScale(?:Inv|Label)?|git(?:Inv|BranchLabel)?)(0|[1-9]\d?)$/;

/** What the palettes of one render are built from (D258). */
export interface PaletteSource {
  /** The theme's entries: colours or rules. */
  readonly spec: Readonly<Partial<Record<string, readonly string[]>>>;
  /** The author's whole lists, checked colours, a table's `palette` variables' among them. */
  readonly user: Readonly<Partial<Record<string, readonly SafeColor[]>>>;
  /** The author's numbered entries (`cScale3`), checked colours. */
  readonly slots: ReadonlyMap<string, SafeColor>;
}

type PaletteLists = PaletteSource['spec'];

export const NO_PALETTES: PaletteSource = { spec: {}, user: {}, slots: new Map() };

/** A palette override as a list: an array as given, or a comma-separated string. */
function paletteItems(raw: unknown): readonly unknown[] | undefined {
  if (Array.isArray(raw)) return raw as unknown[];
  return typeof raw === 'string' ? splitTopLevel(raw, 'comma') : undefined;
}
/** The author's numbered palette entries (`cScale3`) that are safe colours; the rest dropped. */
function numberedOverrides(
  vars: Readonly<Record<string, unknown>>,
  drop: (name: string, raw: unknown) => void
): [string, SafeColor][] {
  const out: [string, SafeColor][] = [];
  for (const key of Object.keys(vars)) {
    const m = RE_SLOT.exec(key);
    const raw = vars[key];
    if (
      !m ||
      // The git palettes have eight slots, the others twelve (D267, D258).
      Number(m[2]) >= (m[1]!.startsWith('g') ? GIT_PALETTE_LIMIT : PALETTE_LIMIT) ||
      raw === undefined ||
      raw === null ||
      raw === ''
    )
      continue;
    const c = typeof raw === 'string' ? checkCssColor(raw) : undefined;
    if (c === undefined) drop(key, raw);
    else out.push([key, c]);
  }
  return out;
}

const SCALE_PALETTES = ['cScale', 'cScaleInv', 'cScaleLabel', 'git', 'gitInv', 'gitBranchLabel'];

/**
 * `lists` with the scale and git palettes it leaves out taken from v12 theme-base's derivation
 * over the base colours (`baseScalesFor`). An inverse whose palette the theme writes inverts
 * that palette's slots, as v12 derives one from a fixed `cScale`; the built-in themes write all
 * six, so they read none of these.
 */
function withBaseScales(lists: PaletteLists, darkMode: boolean): PaletteLists {
  if (SCALE_PALETTES.every((p) => Object.hasOwn(lists, p))) return lists;
  const inverted = (p: 'cScale' | 'git') =>
    lists[p] && { [`${p}Inv`]: lists[p].map((_, i) => `invert(${p}${i})`) };
  return { ...baseScalesFor(darkMode), ...inverted('cScale'), ...inverted('git'), ...lists };
}

/** The author's whole palette lists that are safe colours; the rest dropped with a warning. */
function wholeLists(
  vars: Readonly<Record<string, unknown>>,
  tablePalettes: readonly string[],
  drop: (name: string, raw: unknown) => void
): Partial<Record<string, readonly SafeColor[]>> {
  const user: Partial<Record<string, readonly SafeColor[]>> = {};
  for (const name of [...PALETTE_VARIABLES, ...tablePalettes]) {
    const raw = Object.hasOwn(vars, name) ? vars[name] : undefined;
    if (raw === undefined || raw === null) continue;
    const items = paletteItems(raw);
    const checked = items?.flatMap((c) => (typeof c === 'string' ? checkCssColor(c) : []) ?? []);
    if (!checked || checked.length > MAX_PALETTE || checked.length !== items!.length) {
      drop(name, raw);
      continue;
    }
    // An empty chart palette is unset, as an empty value is: a reader cycles through it (D545).
    if (checked.length || (name !== 'plotColorArray' && !tablePalettes.includes(name)))
      user[name] = checked;
  }
  return user;
}

/**
 * The palette overrides of one render, checked: a whole list (`borderColorArray`, `cScale`, …)
 * is an array or a comma-separated string; `cScale0`–`cScale11`, `cScaleInv<n>`,
 * `cScaleLabel<n>`, `git0`–`git7`, `gitInv<n>` and `gitBranchLabel<n>` replace one entry. Any
 * unsafe colour drops that override with a warning. The theme's own entries are evaluated when a
 * renderer reads the palette.
 */
export function paletteSource(
  spec: ThemeSpec,
  vars: Readonly<Record<string, unknown>> | undefined,
  warn: ((warning: ThemeWarning) => void) | undefined,
  /** The author's `themeVariables.darkMode`, not the theme's `dark` flag. */
  darkMode: boolean,
  /** The diagram table's `palette` variables, which the author lists as palettes (D545). */
  tablePalettes: readonly string[] = []
): PaletteSource {
  const drop = (name: string, raw: unknown) =>
    warn?.({
      code: 'THEME_VARIABLE_DROPPED',
      message: `themeVariables.${name} value ${JSON.stringify(String(raw).slice(0, 60))} is not allowed and was dropped.`,
    });
  // A theme that leaves the chart series palette out reads v12 theme-base's (D545).
  const lists = withBaseScales(
    {
      plotColorArray: BASE_PLOT,
      ...spec.palettes,
      ...(darkMode ? spec.darkModePalettes : undefined),
    },
    darkMode
  );
  const slots = new Map<string, SafeColor>();
  if (!vars) return { spec: lists, user: {}, slots };
  const user = wholeLists(vars, tablePalettes, drop);
  for (const [key, c] of numberedOverrides(vars, drop)) {
    // An entry the palette has no slot for is accepted and ignored (R-CONF-5).
    const m = RE_SLOT.exec(key) as RegExpExecArray;
    const p = m[1]!;
    if (Number(m[2]) < (user[p] ?? lists[p] ?? []).length) slots.set(key, c);
  }
  return { spec: lists, user, slots };
}
