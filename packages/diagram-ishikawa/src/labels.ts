import type { IshikawaCause, IshikawaModel } from './model.ts';

/**
 * Every text the ishikawa layout hands to core's label layout (D176, D178), as written: the
 * effect, then every cause and sub-cause in source order (pre-order, a loop: chains run deep).
 */
export function ishikawaLabels(model: IshikawaModel): readonly string[] {
  const out: string[] = [];
  if (model.effect) out.push(model.effect.text);
  const stack: IshikawaCause[] = [...model.causes].reverse();
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    out.push(c.text);
    for (let i = c.causes.length - 1; i >= 0; i--) stack.push(c.causes[i]!);
  }
  return out;
}
