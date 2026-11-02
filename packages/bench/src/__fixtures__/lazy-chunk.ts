// Repetitive on purpose, so it compresses well.
const PADDING =
  'lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding lazy-chunk-padding';

export function wrap(lines: number): string {
  return `<svg data-lines="${lines}" data-padding="${PADDING}${PADDING}${PADDING}"></svg>`;
}
