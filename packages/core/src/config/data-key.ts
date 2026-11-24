/**
 * A text form of plain data that differs for any two different values: strings, numbers (`-0`
 * and `NaN` included), booleans, `null`, `undefined`, arrays, and objects whose prototype is
 * `Object.prototype` or `null`, their keys in order. Undefined when the value holds anything else
 * (a function, a date, a class instance, an array with a hole): such a value has no key.
 * What is derived from a config value alone can be kept by this key (a resolved diagram-text
 * config, a theme's derived parts).
 */
export function dataKey(value: unknown): string | undefined {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (typeof value === 'boolean' || value === null || value === undefined) return String(value);
  let parts: (string | undefined)[];
  let open = '{';
  if (Array.isArray(value)) {
    // `map` leaves a hole a hole, which `includes` counts as undefined: no key.
    parts = value.map(dataKey);
    open = '[';
  } else {
    const proto: unknown = typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
    if (proto !== Object.prototype && proto !== null) return undefined;
    const o = value as Record<string, unknown>;
    parts = Object.keys(o).map((k) => {
      const v = dataKey(o[k]);
      return v === undefined ? v : `${JSON.stringify(k)}:${v}`;
    });
  }
  if (parts.includes(undefined)) return undefined;
  return open + parts.join(',') + (open === '[' ? ']' : '}');
}
