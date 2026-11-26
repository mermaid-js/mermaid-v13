// HTML character references in label text. A small named set covers what labels use; numeric
// references cover the rest. Unknown names stay literal text.

const NAMED: Readonly<Record<string, string>> = {
  // HTML's legacy names, which it also reads without `;` (D709): `LEGACY` takes the first 20.
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: '\u00a0',
  shy: '\u00ad',
  copy: '©',
  reg: '®',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  middot: '·',
  sect: '§',
  para: '¶',
  pound: '£',
  yen: '¥',
  cent: '¢',
  laquo: '«',
  raquo: '»',
  apos: "'",
  trade: '™',
  bull: '•',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  euro: '€',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  rArr: '⇒',
  lArr: '⇐',
  hArr: '⇔',
  ne: '≠',
  le: '≤',
  ge: '≥',
  infin: '∞',
  check: '✓',
  hearts: '♥',
  // ASCII punctuation, which authors write as `#name;` to keep it away from the syntax (#396).
  colon: ':',
  semi: ';',
  vert: '|',
  verbar: '|',
  lpar: '(',
  rpar: ')',
  lsqb: '[',
  rsqb: ']',
  lcub: '{',
  rcub: '}',
  num: '#',
  excl: '!',
  quest: '?',
  commat: '@',
  equals: '=',
  plus: '+',
  comma: ',',
  period: '.',
  sol: '/',
  bsol: '\\',
  grave: '`',
  lowbar: '_',
  percnt: '%',
  dollar: '$',
  ast: '*',
};

// The names of `NAMED` that HTML also decodes without `;`, in text even as the start of a longer
// word (D709). The longest are six letters.
const LEGACY = new Set(Object.keys(NAMED).slice(0, 20));

const RE_ENTITY = /&(?:#(\d+)|#[xX]([\da-fA-F]+)|([A-Za-z][A-Za-z\d]*))(;?)/y;

/**
 * Decodes the character reference starting at `at`, if there is one, as HTML does in text
 * (D709): a numeric reference or a legacy name needs no `;`. With `xml`, as XML does: every
 * reference needs its `;` and a name is read whole. Returns the text and the length it replaces.
 */
export function entityAt(source: string, at: number, xml?: boolean): [string, number] | undefined {
  RE_ENTITY.lastIndex = at;
  const m = RE_ENTITY.exec(source);
  if (!m || (xml && !m[4])) return undefined;
  const [all, dec, hex, name, semi] = m;
  if (name !== undefined) {
    if (semi && Object.hasOwn(NAMED, name)) return [NAMED[name] as string, all.length];
    for (let n = xml ? 0 : name.length; n > 1; n--) {
      const legacy = name.slice(0, n);
      if (LEGACY.has(legacy)) return [NAMED[legacy] as string, n + 1];
    }
    return undefined;
  }
  const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex as string, 16);
  // NUL, surrogates and out-of-range code points become U+FFFD, as in HTML.
  const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
  return [String.fromCodePoint(valid ? code : 0xfffd), all.length];
}

/**
 * `text` with every character reference decoded, for text that is drawn without `layoutLabel`.
 * A reference `entityAt` does not know stays as written.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&[#\w]+;?/g, (all) => {
    const entity = entityAt(all, 0);
    return entity ? entity[0] + all.slice(entity[1]) : all;
  });
}
