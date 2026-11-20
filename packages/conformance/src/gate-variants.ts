/**
 * The lexer gates' generated variants: edits of a source's body (the text after its front
 * matter) that several types' gate corpora share, and the loop that adds each variant of every
 * source to a gate corpus.
 */
import type { CorpusItem } from './types.ts';

export const FRONT_MATTER = /^---[\s\S]*?\n---[^\S\n]*\n/;

/** `edit` applied to the text after the front matter. */
export function body(src: string, edit: (text: string) => string): string {
  const head = FRONT_MATTER.exec(src)?.[0] ?? '';
  return head + edit(src.slice(head.length));
}

/** Every line break a CRLF. */
export const crlf = (src: string): string => body(src, (b) => b.replace(/\r?\n/g, '\r\n'));

/** Each indent of spaces as tabs, one per two spaces (rounded up). */
export const tabs = (src: string): string =>
  body(src, (b) => b.replace(/^ +/gm, (m) => '\t'.repeat(Math.ceil(m.length / 2))));

/** A directive v12 removes, wherever in a line it is. */
export const DIRECTIVE = '%%{init: {}}%%';

/**
 * A directive through the middle of every line after the first line `header` matches (pitfall
 * 3): at the middle of the line's text after its indent, moved off a surrogate pair. Lines
 * with fewer than two characters of text, `%%` lines and blank lines are left as they are.
 */
export const midLineDirective =
  (header: RegExp) =>
  (src: string): string =>
    body(src, (b) => {
      const lines = b.split('\n');
      const headerLine = lines.findIndex((l) => header.test(l));
      return lines
        .map((line, k) => {
          const text = line.trimStart();
          if (k <= headerLine || text.length < 2 || text.startsWith('%%')) return line;
          let at = line.length - text.length + Math.floor(text.length / 2);
          if (/[\udc00-\udfff]/.test(line.charAt(at))) at++;
          return line.slice(0, at) + DIRECTIVE + line.slice(at);
        })
        .join('\n');
    });

/** A generated variant of a gate source: its id suffix and the edit that makes it. */
export type Variant = readonly [suffix: string, make: (src: string) => string];

/** `items`, then each of them in every one of `variants` that changes it, id `<id> (<suffix>)`. */
export function withVariants(
  items: readonly CorpusItem[],
  variants: readonly Variant[]
): CorpusItem[] {
  const out = [...items];
  for (const [suffix, make] of variants) {
    for (const item of items) {
      const source = make(item.source);
      if (source !== item.source) out.push({ id: `${item.id} (${suffix})`, source });
    }
  }
  return out;
}

/**
 * The items of `gate` that `listed` (what the parity suite already reads from its dirs and
 * files, `registry.ts`) does not hold, ids prefixed `<type>-gate/`: model parity over the
 * gate's generated variants.
 */
export function gateVariants(
  gate: readonly CorpusItem[],
  listed: readonly CorpusItem[],
  type: string
): CorpusItem[] {
  const ids = new Set(listed.map((c) => c.id));
  return gate
    .filter((item) => !ids.has(item.id))
    .map((item) => ({ id: `${type}-gate/${item.id}`, source: item.source }));
}
