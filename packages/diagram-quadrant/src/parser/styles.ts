/**
 * Point and class styles, checked as v12's `parseStyles` (`quadrantDb.ts`, `utils.ts`): each
 * style is split at the first `:` with the blanks around it (a further `:` part is ignored),
 * and the value must fit its key. Where v12 threw (and rejected the chart), a bad style here is
 * one error diagnostic and the other styles still apply (parser-method §3).
 */
import type { QuadrantStyles } from '../model.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const NUMBER = /^\d+$/;
const HEX = /^#?([\dA-Fa-f]{6}|[\dA-Fa-f]{3})$/;
const PIXELS = /^\d+px$/;

/**
 * Each key's value pattern and an example for the message. A Map, not an object: a key such as
 * `constructor` or `__proto__` must not find `Object.prototype`'s (it is an unknown key).
 */
const KEYS: ReadonlyMap<string, { readonly ok: RegExp; readonly example: string }> = new Map([
  ['radius', { ok: NUMBER, example: 'a whole number, e.g. `radius: 10`' }],
  ['color', { ok: HEX, example: 'a hex colour, e.g. `color: #ff0000` or `color: #f00`' }],
  ['stroke-color', { ok: HEX, example: 'a hex colour, e.g. `stroke-color: #ff0000`' }],
  ['stroke-width', { ok: PIXELS, example: 'a size in pixels, e.g. `stroke-width: 2px`' }],
]);

/** A style v12 refused: its diagnostic code and message. */
export interface StyleProblem {
  code: 'QUADRANT_STYLE_VALUE' | 'QUADRANT_STYLE_UNKNOWN';
  message: string;
}

/** Apply one style (`radius: 10`, trimmed) to `out`; a problem when v12 refused it. */
export function applyStyle(style: string, out: Mutable<QuadrantStyles>): StyleProblem | undefined {
  const [key = '', v = ''] = style.trim().split(/\s*:\s*/);
  const known = KEYS.get(key);
  if (known === undefined) {
    return {
      code: 'QUADRANT_STYLE_UNKNOWN',
      message:
        key === ''
          ? 'Empty point style: write styles as `radius: 10, color: #ff0000`, separated by `,`.'
          : `\`${key}\` is not a point style: use \`radius\`, \`color\`, \`stroke-color\` or \`stroke-width\`.`,
    };
  }
  const { ok, example } = known;
  if (!ok.test(v)) {
    const got = v === '' ? 'it has no value' : `\`${v}\` is not valid`;
    return {
      code: 'QUADRANT_STYLE_VALUE',
      message: `\`${key}\` takes ${example}; ${got}.`,
    };
  }
  if (key === 'radius') out.radius = Number.parseInt(v, 10);
  else if (key === 'color') out.color = v;
  else if (key === 'stroke-color') out.strokeColor = v;
  else out.strokeWidth = Number.parseInt(v, 10);
  return undefined;
}
