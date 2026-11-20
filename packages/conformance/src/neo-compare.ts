/**
 * How the neo theme specs (`neo-theme.spec.ts`, `neo-dark-theme.spec.ts`) compare one v13 theme
 * with v12's resolved variables for the same theme (D151).
 */
import {
  NUMBERED_PALETTES,
  PALETTE_LIMITS,
  type NumberedPalette,
  type Theme,
} from '@mermaid-js/core/theme';
import { VOCABULARY, paletteColours, v12Value } from './diagram-themes.ts';
import { hex } from './hex.ts';

/** v12's resolved theme variables. */
export type Vars = Readonly<Record<string, unknown>>;

/** `name` in `t`, read as its vocabulary kind. */
export function v13Value(t: Theme, name: string): string | number {
  const kind = VOCABULARY[name]?.kind;
  if (kind === 'padding') return t.padding(name, 15);
  if (kind === 'length') return t.number(name);
  return t.value(name);
}

/** Whether `theme` gives `name` the value v12 resolved in `old`. */
export function sameAsV12(old: Vars, theme: Theme, name: string): boolean {
  const was = v12Value(old, name);
  if (typeof was !== 'string' && typeof was !== 'number' && typeof was !== 'boolean') return false;
  const kind = VOCABULARY[name]?.kind;
  // A diagram's palette variable (xychart's plotColorPalette): v12's comma-separated list.
  if (kind === 'palette') return paletteColours(was) === paletteColours(theme.palette(name));
  const now = v13Value(theme, name);
  if (kind === 'color') return hex(was) !== undefined && hex(was) === hex(now);
  if (kind === 'length') return Number.parseFloat(String(was)) === now;
  return String(was).trim() === String(now).trim();
}

/** v12's palette `name` in `old`: its numbered variables, or its list. */
export function v12Palette(old: Vars, name: string): string[] {
  if (NUMBERED_PALETTES.includes(name as never))
    return Array.from(
      { length: PALETTE_LIMITS[name as NumberedPalette] },
      (_, i) => old[`${name}${i}`] as string
    );
  const list = old[name];
  return Array.isArray(list) ? (list as string[]) : [];
}
