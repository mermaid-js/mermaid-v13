/**
 * What every section of one usecase render draws from: the writer, the layout and the views it
 * was built from, the paints, and the helpers each section shares (classes, fonts, label text).
 */
import { checkStyle, type Attrs, type SafeValue, type SvgWriter } from '@mermaid-js/core/svg';
import type { FontKey } from '@mermaid-js/core/text';
import { FONT_WEIGHT } from '../config.ts';
import type { UsecaseLayout } from '../layout/layout.ts';
import type { UsecasePrepared } from '../layout/prepare.ts';
import type { UsecaseModel } from '../model.ts';
import type { UsecaseRenderContext } from './context.ts';
import type { Paints } from './paint.ts';

export interface Scene {
  readonly w: SvgWriter;
  readonly model: UsecaseModel;
  readonly layout: UsecaseLayout;
  readonly p: UsecasePrepared;
  readonly ctx: UsecaseRenderContext;
  readonly paint: Paints;
  /** The font attributes of a part drawn in `font`, beside the root's. */
  readonly fontOf: (font: FontKey) => Attrs;
  /** The spoken label of each model element, by model id (for note and relation names). */
  readonly spokenOf: ReadonlyMap<string, string>;
}

export { cls } from '@mermaid-js/core/svg';

/**
 * The font attributes for a part drawn in `font`: its size always (parts differ from the root's
 * size), its family and weight where they differ from the root's, checked as a style is.
 */
export function fontAttrs(root: { family: string }): (font: FontKey) => Attrs {
  const cache = new Map<string, Attrs>();
  return (font) => {
    const key = `${font.family}|${font.size}|${font.weight}`;
    let out = cache.get(key);
    if (out) return out;
    const decls = [`font-size:${font.size}px`];
    if (font.family !== root.family) decls.push(`font-family:${font.family}`);
    if (font.weight !== FONT_WEIGHT.normal) decls.push(`font-weight:${font.weight}`);
    const text = checkStyle(decls).text;
    out = {
      'font-size': font.size,
      'font-family': text['font-family'] as SafeValue | undefined,
      'font-weight': text['font-weight'] as SafeValue | undefined,
    };
    cache.set(key, out);
    return out;
  };
}
