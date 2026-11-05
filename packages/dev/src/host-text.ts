/**
 * The text a fixture stands for on v12's e2e page: v12's viewer put it in a `.mermaid` element
 * as HTML and `run()` read it back entity-decoded, so fixtures written for that page carry
 * `&lt;&lt;interface&gt;&gt;` for `<<interface>>` (the class corpus does, 58 files). v13's
 * `run()` reads `textContent`, which decodes the same way. Callers that pass a fixture straight
 * to `render()` (the e2e snapshot runner, the dev explorer, the gallery) decode it here first.
 * Unknown names are left as written. Browser-safe: no Node imports.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export const asHostText = (source: string): string =>
  source.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
  });
