/**
 * Turning one attribute value into its unescaped string form. Both writer backings and the
 * `SvgTree` view call this, so they agree byte for byte.
 */
import { HREF_TAGS, isAllowedAttr, isAllowedTag } from './allowlist.ts';
import { num } from './escape.ts';

export function checkTag(tag: string): void {
  if (!isAllowedTag(tag)) throw new TypeError(`<${tag}> is not an allowed SVG element`);
}

/** The attribute's value as written (before escaping), or undefined to skip it. */
export function formatValue(tag: string, name: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isAllowedAttr(name)) throw new TypeError(`${name} is not an allowed SVG attribute`);
  if (name === 'href' && !HREF_TAGS.has(tag))
    throw new TypeError(`href is not allowed on <${tag}>`);
  if (name === 'xmlns' && tag !== 'svg') throw new TypeError(`xmlns is only allowed on <svg>`);
  if (typeof value === 'number') return num(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const list = value as readonly unknown[];
    for (const v of list) if (typeof v !== 'number') throw new TypeError(`${name} takes numbers`);
    const numbers = list as readonly number[];
    if (name === 'viewBox') return numbers.map(num).join(' ');
    if (name === 'points') {
      let out = '';
      for (let i = 0; i + 1 < numbers.length; i += 2) {
        out +=
          (i === 0 ? '' : ' ') + num(numbers[i] as number) + ',' + num(numbers[i + 1] as number);
      }
      return out;
    }
  }
  throw new TypeError(`Unsupported value for ${name}`);
}
