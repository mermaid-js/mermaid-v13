/**
 * `treemap.valueFormat` (D409): v12's formatter (`renderer.ts:50-77`) over the package's
 * d3-format. v12 special-cased three `$` forms before calling d3: `$0,0` is `$` and `,`; a `$`
 * specifier with a comma is `$` and `,` with the first `.digits` in it (so `$,.2f` drops its
 * `f`: `,.2`); any other `$x` is `$` and `x`. A specifier d3 rejects falls back to `,`.
 */
import { d3Format } from './d3-format.ts';

export { d3Format } from './d3-format.ts';

/** The `,` formatter, v12's default and fallback. */
const comma = d3Format(',')!;

const dollar =
  (f: (value: number) => string) =>
  (value: number): string =>
    '$' + f(value);

/**
 * The formatter for a `treemap.valueFormat` value. An empty or non-string value is `,`, as v12's
 * `config.valueFormat || ','` and its `try` gave. Where v12 threw while drawing (a `$` and a
 * rest d3 rejects, such as `$abc`), v13 falls back to `,` as for any other rejected specifier.
 */
export function treemapValueFormat(valueFormat: unknown): (value: number) => string {
  if (typeof valueFormat !== 'string' || valueFormat === '') return comma;
  if (valueFormat === '$0,0') return dollar(comma);
  if (valueFormat.startsWith('$') && valueFormat.includes(',')) {
    const precision = /\.\d+/.exec(valueFormat)?.[0] ?? '';
    return dollar(d3Format(',' + precision)!);
  }
  if (valueFormat.startsWith('$')) {
    const rest = d3Format(valueFormat.slice(1));
    return rest ? dollar(rest) : comma;
  }
  return d3Format(valueFormat) ?? comma;
}
