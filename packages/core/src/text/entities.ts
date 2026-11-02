// HTML character references in label text. A small named set covers what labels use; numeric
// references cover the rest. Unknown names stay literal text.

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  shy: '\u00ad',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  middot: '·',
  bull: '•',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  sect: '§',
  para: '¶',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
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
};

const RE_ENTITY = /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([A-Za-z][A-Za-z\d]{1,31}));/y;

/**
 * Decodes the character reference starting at `at`, if there is one. Returns the text and the
 * length it replaces.
 */
export function entityAt(source: string, at: number): [string, number] | undefined {
  RE_ENTITY.lastIndex = at;
  const m = RE_ENTITY.exec(source);
  if (!m) return undefined;
  const [all, dec, hex, name] = m;
  if (name !== undefined) {
    return Object.hasOwn(NAMED, name) ? [NAMED[name] as string, all.length] : undefined;
  }
  const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex as string, 16);
  // NUL, surrogates and out-of-range code points become U+FFFD, as in HTML.
  const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
  return [String.fromCodePoint(valid ? code : 0xfffd), all.length];
}
