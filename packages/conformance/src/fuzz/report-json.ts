/**
 * JSON for the fuzz run's report files (#847). The inputs hold lone UTF-16 surrogates on
 * purpose (the mutator's `'\ud800'` fragment, the hostile-text payload), and `JSON.stringify`
 * writes those as `\ud800` escapes. That is valid JSON for JavaScript, but jq and other strict
 * readers reject it, so the nightly job's summary step failed on a passing run. Each lone
 * surrogate is written as the visible text `\uD800` instead: the file is well-formed UTF-8 and
 * the example stays readable. A replay uses `FUZZ_SEED` and `FUZZ_CASE`, not the stored text.
 */
const LONE_SURROGATE = /\p{Cs}/gu;

const visible = (s: string): string =>
  s.replace(LONE_SURROGATE, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** `JSON.stringify(value, null, space)`, with every lone surrogate in a string made visible. */
export function reportJson(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, v: unknown) => (typeof v === 'string' ? visible(v) : v),
    space
  );
}
