/**
 * `esc` and `escAttr` against the implementations they replaced, kept here as the reference.
 * Escaping is the security boundary of every text and attribute value (R-SEC), so the fast
 * paths must give exactly the old output for every string: each single code unit, every pair
 * and triple of the characters escaping treats specially (markup, tab/LF/CR, controls, DEL,
 * lone and paired surrogate halves, U+FFFE/U+FFFF), every surrogate pairing beside a markup
 * character, 200,000 generated strings, the empty string and long ones; in text and
 * attribute context, directly and through both writers. Deliberately broken copies of the
 * fast paths must fail the same comparison, so the corpus is shown to catch such mistakes.
 */
import { describe, expect, it } from 'vitest';
import { esc, escAttr } from './escape.ts';
import { streamWriter, treeWriter } from './index.ts';

// The reference: escape.ts as it was before the fast paths, verbatim.
const INVALID_XML = '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';
const RE_NEEDS_ESC = new RegExp(`[&<>"${INVALID_XML}]`, 'u');
const RE_ESC = new RegExp(`[&<>"]|[${INVALID_XML}]+`, 'gu');
const ESC: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};
function oldEsc(text: string): string {
  return RE_NEEDS_ESC.test(text) ? text.replace(RE_ESC, (c) => ESC[c] ?? '') : text;
}
const RE_ATTR_WS = /[\t\n\r]/;
const RE_ATTR_WS_G = /[\t\n\r]/g;
const ATTR_WS: Readonly<Record<string, string>> = { '\t': '&#9;', '\n': '&#10;', '\r': '&#13;' };
function oldEscAttr(value: string): string {
  const e = oldEsc(value);
  return RE_ATTR_WS.test(e) ? e.replace(RE_ATTR_WS_G, (c) => ATTR_WS[c] as string) : e;
}

/** Characters escaping treats specially, with neighbours on each side of every boundary. */
const SPECIAL: readonly string[] = [
  '&',
  '<',
  '>',
  '"',
  "'",
  '\t',
  '\n',
  '\r',
  '\x00',
  '\x01',
  '\x08',
  '\x0b',
  '\x0c',
  '\x0e',
  '\x1f',
  ' ',
  'a',
  '=',
  ';',
  '#',
  '\x7e',
  '\x7f',
  '\x80',
  '\x9f',
  '\xa0',
  ' ',
  '퟿',
  '\ud800',
  '\ud83d',
  '\udbff',
  '\udc00',
  '\ude00',
  '\udfff',
  '',
  '﻿',
  '�',
  '￾',
  '￿',
];

/** A small seeded generator (mulberry32), so a failure reproduces. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generated(count: number, seed: number): string[] {
  const r = random(seed);
  const int = (n: number) => Math.floor(r() * n);
  const unit = (): string => {
    const k = r();
    if (k < 0.3) return SPECIAL[int(SPECIAL.length)] as string;
    if (k < 0.5) return String.fromCharCode(0x20 + int(0x5f));
    if (k < 0.6) return String.fromCharCode(0xd800 + int(0x800)); // a lone half, either kind
    if (k < 0.72) return String.fromCharCode(0xd800 + int(0x400), 0xdc00 + int(0x400)); // a pair
    if (k < 0.8) return String.fromCharCode(int(0x20));
    if (k < 0.85) return '&amp;'.slice(0, 1 + int(5));
    return String.fromCharCode(int(0x10000));
  };
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const k = r();
    const length = k < 0.7 ? int(17) : k < 0.97 ? 17 + int(200) : 217 + int(1000);
    let s = '';
    while (s.length < length) s += unit();
    out.push(s);
  }
  return out;
}

function corpus(): string[] {
  const out: string[] = [''];
  for (let c = 0; c <= 0xffff; c++) {
    const ch = String.fromCharCode(c);
    // Alone, beside each markup character, and after or before each half of a pair.
    out.push(ch, '&' + ch, ch + '<', 'a' + ch + '>b', '"' + ch + '"', '\ud83d' + ch + '&');
    out.push('&' + ch + '\ude00', '\t' + ch + '&', ch + '😀"');
  }
  for (const a of SPECIAL) for (const b of SPECIAL) out.push(a + b, 'x' + a + b + 'y');
  for (const a of SPECIAL) for (const b of SPECIAL) for (const c of SPECIAL) out.push(a + b + c);
  // Every high half with boundary low halves, and boundary high halves with every low half.
  for (let i = 0; i < 0x400; i++) {
    for (const lo of [0xdc00, 0xde00, 0xdfff])
      out.push('&' + String.fromCharCode(0xd800 + i, lo) + '<');
    for (const hi of [0xd800, 0xd83d, 0xdbff])
      out.push('"' + String.fromCharCode(hi, 0xdc00 + i) + '>');
  }
  // Each special character and pair at every place in values either side of the length at
  // which the fast paths stop.
  for (let n = 60; n <= 68; n++) {
    for (const a of SPECIAL) {
      out.push(
        'x'.repeat(n - 1) + a,
        a + 'x'.repeat(n - 1),
        'y'.repeat(n >> 1) + a + 'y'.repeat(n - 1 - (n >> 1))
      );
      out.push('&' + 'z'.repeat(n - 2) + a, a + 'z'.repeat(n - 2) + '"');
    }
    out.push('\ud83d\ude00'.repeat(n >> 1) + '&', '&'.repeat(n), '\t'.repeat(n));
  }
  for (const s of generated(200_000, 0x13579bdf)) out.push(s);
  return out;
}

const LONG: readonly string[] = [
  '&'.repeat(1 << 18),
  '<'.repeat(1 << 18),
  '"'.repeat(1 << 18),
  '\x01'.repeat(1 << 18),
  '\t'.repeat(1 << 18),
  'a'.repeat(1 << 18),
  'a'.repeat(1 << 18) + '&',
  '&' + 'a'.repeat(1 << 18),
  '😀'.repeat(1 << 17) + '&',
  '\ud800'.repeat(1 << 18),
  'a&<\x00😀\udc00\n"'.repeat(1 << 15),
];

const CORPUS = corpus();

// A pass over the whole corpus takes a few seconds alone, and longer on a loaded machine.
const SLOW = { timeout: 120_000 };

/** The reference's output for each string, worked out once per reference. */
const expected = new Map<(s: string) => string, readonly string[]>();
function expectedOf(
  reference: (s: string) => string,
  strings: readonly string[]
): readonly string[] {
  if (strings !== CORPUS) return strings.map(reference);
  let out = expected.get(reference);
  if (out === undefined) expected.set(reference, (out = strings.map(reference)));
  return out;
}

/**
 * How many strings `candidate` writes differently from `reference`, and the first of them;
 * with `stop`, only whether there is one.
 */
function mismatches(
  candidate: (s: string) => string,
  reference: (s: string) => string,
  strings: readonly string[],
  stop = false
): { count: number; first?: string } {
  const want = expectedOf(reference, strings);
  let count = 0;
  let first: string | undefined;
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i] as string;
    if (candidate(s) !== want[i]) {
      count++;
      first ??= JSON.stringify(s.length > 80 ? s.slice(0, 80) + '…' : s);
      if (stop) break;
    }
  }
  return first === undefined ? { count } : { count, first };
}

describe('esc and escAttr match the replaced implementations', () => {
  it('builds the corpus it claims', () => {
    expect(CORPUS.length).toBeGreaterThan(200_000 + 9 * 0x10000);
  });

  it('esc: every string of the corpus, and long strings', SLOW, () => {
    expect(mismatches(esc, oldEsc, CORPUS)).toEqual({ count: 0 });
    expect(mismatches(esc, oldEsc, LONG)).toEqual({ count: 0 });
  });

  it('escAttr: every string of the corpus, and long strings', SLOW, () => {
    expect(mismatches(escAttr, oldEscAttr, CORPUS)).toEqual({ count: 0 });
    expect(mismatches(escAttr, oldEscAttr, LONG)).toEqual({ count: 0 });
  });

  it('text and attribute values through both writers', SLOW, () => {
    const sample = CORPUS.filter((_, i) => i % 7 === 0);
    for (const make of [streamWriter, treeWriter]) {
      const text = (s: string) => {
        const w = make();
        w.open('text');
        w.text(s);
        w.close();
        return w.finish();
      };
      const oldText = (s: string) => {
        const e = oldEsc(s);
        return e === '' ? '<text/>' : '<text>' + e + '</text>';
      };
      const attr = (s: string) => {
        const w = make();
        w.leaf('g', { 'data-id': s, class: s });
        return w.finish();
      };
      const oldAttr = (s: string) => `<g data-id="${oldEscAttr(s)}" class="${oldEscAttr(s)}"/>`;
      expect(mismatches(text, oldText, sample), make.name).toEqual({ count: 0 });
      expect(mismatches(attr, oldAttr, sample), make.name).toEqual({ count: 0 });
    }
  });
});

// Copies of the fast paths, each with one deliberate mistake. The comparison above must catch
// every one; a corpus that missed one would not be evidence for the real code.
function brokenEsc(maybeInvalid: string, markup: Readonly<Record<number, string>>) {
  const reMaybe = new RegExp(`[${maybeInvalid}]`);
  return (text: string): string => {
    if (!RE_NEEDS_ESC.test(text)) return text;
    if (reMaybe.test(text)) return text.replace(RE_ESC, (c) => ESC[c] ?? '');
    let out = '';
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      const e = markup[text.charCodeAt(i)];
      if (e !== undefined) {
        out += text.slice(from, i) + e;
        from = i + 1;
      }
    }
    return out + text.slice(from);
  };
}
const MARKUP = { 38: '&amp;', 60: '&lt;', 62: '&gt;', 34: '&quot;' };

describe('the comparison catches broken fast paths', () => {
  const broken: Record<string, (s: string) => string> = {
    'a correct copy (control)': brokenEsc(INVALID_XML, MARKUP),
    'no surrogates in the pre-test': brokenEsc(
      '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ufffe\\uffff',
      MARKUP
    ),
    'only high surrogates in the pre-test': brokenEsc(
      '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udbff\\ufffe\\uffff',
      MARKUP
    ),
    'no DEL in the pre-test': brokenEsc(
      '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\ud800-\\udfff\\ufffe\\uffff',
      MARKUP
    ),
    'no U+FFFE/U+FFFF in the pre-test': brokenEsc(
      '\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff',
      MARKUP
    ),
    'no vertical tab in the pre-test': brokenEsc(
      '\\x00-\\x08\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff',
      MARKUP
    ),
    'no quote in the loop': brokenEsc(INVALID_XML, { 38: '&amp;', 60: '&lt;', 62: '&gt;' }),
    'an apostrophe escaped too': brokenEsc(INVALID_XML, { ...MARKUP, 39: '&#39;' }),
  };

  for (const [what, candidate] of Object.entries(broken)) {
    it(what, SLOW, () => {
      const control = what.endsWith('(control)');
      const found = mismatches(candidate, oldEsc, CORPUS, !control).count;
      expect(found).toBe(control ? 0 : 1);
    });
  }
});

/** `escAttr`'s clean-value test with pre-test class `body`, then the reference. */
function brokenEscAttr(body: string, flags = 'u') {
  const re = new RegExp(`[${body}]`, flags);
  return (value: string): string => (re.test(value) ? oldEscAttr(value) : value);
}

describe('the comparison catches a broken escAttr pre-test', () => {
  const broken: Record<string, (s: string) => string> = {
    'a correct copy (control)': brokenEscAttr(`&<>"\\t\\n\\r${INVALID_XML}`),
    'without the u flag, also correct (control)': brokenEscAttr(`&<>"\\t\\n\\r${INVALID_XML}`, ''),
    'no tab': brokenEscAttr(`&<>"\\n\\r${INVALID_XML}`),
    'no CR': brokenEscAttr(`&<>"\\t\\n${INVALID_XML}`),
    'no LF': brokenEscAttr(`&<>"\\t\\r${INVALID_XML}`),
    'no quote': brokenEscAttr(`&<>\\t\\n\\r${INVALID_XML}`),
    'no invalid characters': brokenEscAttr('&<>"\\t\\n\\r'),
    'no lone surrogates': brokenEscAttr(
      '&<>"\\t\\n\\r\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ufffe\\uffff'
    ),
  };

  for (const [what, candidate] of Object.entries(broken)) {
    it(what, SLOW, () => {
      const control = what.endsWith('(control)');
      const found = mismatches(candidate, oldEscAttr, CORPUS, !control).count;
      expect(found).toBe(control ? 0 : 1);
    });
  }
});
