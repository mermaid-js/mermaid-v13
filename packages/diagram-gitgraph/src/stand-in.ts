/**
 * A stand-in for the specs (exported from `./testing`, never used by a render): `theme` as it
 * will answer the gitGraph theme variables once they are in core (T5 #374), each with its
 * family's value. Core's own variables are passed through.
 */
import { checkColor, type Paint } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import { GIT_GEOMETRY } from './layout/metrics.ts';
import { GIT_PAINT, type GitPaintVariable } from './render/variables.ts';

/** v12's theme families as the gitGraph variables split them (`render/variables.ts`). */
export type GitThemeFamily = 'classic' | 'neo' | 'redux';

/** Each gitGraph variable's value in `family`. */
export function gitValues(family: GitThemeFamily): ReadonlyMap<string, GitPaintVariable | number> {
  const out = new Map<string, GitPaintVariable | number>();
  // D266: the neo themes keep the classic layout geometry.
  for (const v of Object.values(GIT_GEOMETRY))
    out.set(v.name, family === 'redux' ? v.redux : v.classic);
  for (const v of Object.values(GIT_PAINT) as GitPaintVariable[]) out.set(v.name, v);
  return out;
}

export function gitThemeStandIn(theme: Theme, family: GitThemeFamily): Theme {
  const values = gitValues(family);
  const valueOf = (name: string): number | boolean | string | undefined => {
    const v = values.get(name);
    return typeof v === 'object' ? v[family] : v;
  };
  const isColour = (name: string): boolean => {
    const v = values.get(name);
    return typeof v === 'object' && v.kind === 'color';
  };
  // A family value is a literal colour (`#…`) or names another variable.
  const literal = (v: string): boolean => v.startsWith('#');
  const colour = (name: string): Paint => {
    const v = String(valueOf(name));
    return (literal(v) ? checkColor(v) : undefined) ?? theme.color(v);
  };
  return new Proxy(theme, {
    get(target, key, receiver) {
      if (key === 'number' || key === 'length')
        return (name: string) => {
          const v = valueOf(name);
          return typeof v === 'number' ? v : target[key](name);
        };
      if (key === 'color')
        return (name: string) => (isColour(name) ? colour(name) : target.color(name));
      if (key === 'value')
        return (name: string) => {
          if (!values.has(name)) return target.value(name);
          const v = valueOf(name);
          if (!isColour(name)) return String(v);
          return literal(String(v)) ? String(v) : target.value(String(v));
        };
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
}
