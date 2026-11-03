/**
 * A small YAML reader covering what Mermaid feeds to js-yaml with the JSON schema: block and
 * flow collections, quoted and plain scalars, and block scalars. Used for front matter and for
 * flowchart shape data (`@{ … }`).
 *
 * Ported from Pele's `src/util/yaml.ts` @ 3a2f075 (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano). Changes from Pele:
 * - it reads a range of the original source in place, so every diagnostic has a real range;
 * - errors are diagnostics, not exceptions; the first error stops the read (as in js-yaml);
 * - `__proto__`, `constructor` and `prototype` keys are dropped with a warning;
 * - duplicate keys, tags, anchors, aliases and reserved indicators are errors, as in js-yaml;
 * - nesting is capped at {@link MAX_YAML_DEPTH} levels across block and flow collections.
 *
 * Every step is linear in the text it reads (R-PARSE-7).
 */
// cspell:words kepano
import {
  ASCII_MAX,
  C1_LAST,
  CR,
  HIGH_SURROGATE_FIRST,
  HIGH_SURROGATE_LAST,
  LF,
  LOW_SURROGATE_FIRST,
  LOW_SURROGATE_LAST,
  NEL,
  REVERSED_BOM,
  BMP_LAST,
  SPACE,
  TAB,
} from '../parser-kit/char-codes.ts';
import { Diagnostics } from '../parser-kit/diagnostics.ts';
import type { Diagnostic } from '../parser-kit/diagnostics.ts';
import { lineEnd, newlineAt } from '../parser-kit/scanner.ts';

export type YamlValue = null | boolean | number | string | YamlValue[] | YamlMap;
export interface YamlMap {
  [key: string]: YamlValue;
}

export interface YamlOptions {
  /** Offset where the YAML text starts (default 0). */
  start?: number;
  /** Offset where the YAML text ends (default `src.length`). */
  end?: number;
  /** Indent stripped from the start of every line that has it (front matter inside an indented fence). */
  indent?: string;
}

export interface YamlResult {
  /** The document, or `null` when it is empty or has an error. */
  value: YamlValue;
  /** At most one error (the read stops there), plus warnings. Ranges are offsets into `src`. */
  diagnostics: Diagnostic[];
}

/** Maximum nesting of collections. Deeper input is an error instead of a stack overflow. */
export const MAX_YAML_DEPTH = 64;

/** Keys that could reach an object prototype through a later merge. They are dropped. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Thrown inside the reader and turned into a diagnostic. Not an Error: no stack trace.
class YamlError {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly start: number,
    readonly end: number
  ) {}
}

const RE_INT = /^[-+]?(?:0|[1-9][0-9]*)$/;
const RE_HEX = /^[-+]?0x[0-9a-fA-F]+$/;
const RE_OCT = /^[-+]?0o[0-7]+$/;
const RE_BIN = /^[-+]?0b[01]+$/;
const RE_FLOAT = /^[-+]?(?:[0-9][0-9]*(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/;
const RE_INF = /^[-+]?\.(?:inf|Inf|INF)$/;
const RE_NAN = /^\.(?:nan|NaN|NAN)$/;
const RE_KEY_START = /[\s#:,[\]{}&*!|>'"%@`]/;
const RE_FLOW_KEY_END = /[\s,[\]{}]/;
const RE_FLOW_INDICATOR = /[,[\]{}]/;
const RE_SPACE = /\s/;
const RE_LEADING_BLANK = /^[ \t]/;
const RE_BLOCK_HEADER = /^[|>][-+0-9]*\s*(?:#.*)?$/;
const RE_INDENT_DIGIT = /[1-9]/;

function isSpaceOrBreak(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isSeqItem(line: string): boolean {
  return line === '-' || line.startsWith('- ');
}

/** `\r\n` and `\r` read as `\n` inside scalar text (offsets are not taken from it). */
function lf(text: string): string {
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

// Splits `key: rest` at the start of a line. Returns the raw key and the offset where the value starts.
function splitKey(line: string): { key: string; length: number } | null {
  const first = line[0];
  let end: number;
  let colon: number;
  if (first === '"' || first === "'") {
    let i = 1;
    for (;;) {
      if (i >= line.length) return null;
      const c = line[i];
      if (first === '"' && c === '\\') {
        i += 2;
      } else if (c === first) {
        if (first === '"' || line[i + 1] !== "'") break;
        i += 2;
      } else {
        i++;
      }
    }
    end = i + 1;
    colon = end;
    while (isSpaceOrBreak(line[colon])) colon++;
    if (line[colon] !== ':') return null;
  } else {
    if (first === undefined) return null;
    // `-`, `?` and `:` start a plain key when a non-blank follows (js-yaml readPlainScalar).
    const indicator = first === '-' || first === '?' || first === ':';
    if (!indicator && RE_KEY_START.test(first)) return null;
    if (
      indicator &&
      (line.length < 2 || isSpaceOrBreak(line[1]) || line[1] === ':' || line[1] === '#')
    ) {
      return null;
    }
    // js-yaml: the key ends at a `:` followed by a blank or the line end; `a:b` and `a#b`
    // are part of it, and `#` starts a comment only after a blank.
    colon = 1;
    while (colon < line.length) {
      const c = line[colon];
      if (c === ':' && (colon + 1 >= line.length || isSpaceOrBreak(line[colon + 1]))) break;
      if (c === '#' && isSpaceOrBreak(line[colon - 1])) return null;
      colon++;
    }
    if (line[colon] !== ':') return null;
    end = colon;
    while (isSpaceOrBreak(line[end - 1])) end--;
  }
  let length = colon + 1;
  if (length < line.length && !isSpaceOrBreak(line[length])) return null;
  while (isSpaceOrBreak(line[length])) length++;
  return { key: line.slice(0, end), length };
}

const HEX_ESCAPE_LENGTH: Readonly<Record<'x' | 'u' | 'U', number>> = { x: 2, u: 4, U: 8 };

const ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\x85',
  _: '\xa0',
  L: ' ',
  P: ' ',
};

// Folds the line breaks of a scalar: blanks around a break go, one break becomes a space, and
// each further break stays. The lines are trimmed by hand, because a pattern for blanks before
// a line break rescans a long run of blanks from every one of them.
function fold(raw: string): string {
  const text = lf(raw);
  if (!text.includes('\n')) return text;
  const lines = text.split('\n');
  const last = lines.length - 1;
  for (let i = 0; i <= last; i++) {
    const line = lines[i] ?? '';
    let from = 0;
    let to = line.length;
    if (i > 0) {
      while (from < to && (line.charCodeAt(from) === SPACE || line.charCodeAt(from) === TAB))
        from++;
    }
    if (i < last) {
      while (to > from && (line.charCodeAt(to - 1) === SPACE || line.charCodeAt(to - 1) === TAB))
        to--;
    }
    lines[i] = line.slice(from, to);
  }
  return lines
    .join('\n')
    .replace(/\n+/g, (m) => (m.length === 1 ? ' ' : '\n'.repeat(m.length - 1)));
}

function stripComment(s: string): string {
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) {
      return s.slice(0, i);
    }
  }
  return s;
}

/**
 * Offset of a `:` that is followed by a blank or ends `s` (js-yaml reads a mapping entry
 * there), or -1. With `value`, `s` starts a value, and a quoted or flow start is not plain.
 */
function mappingIndicator(s: string, value: boolean): number {
  const first = s[0];
  if (value && (first === '"' || first === "'" || first === '{' || first === '[')) return -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ':' && (i + 1 === s.length || isSpaceOrBreak(s[i + 1]))) return i;
  }
  return -1;
}

/**
 * The first character in `[start, end)` that js-yaml's PATTERN_NON_PRINTABLE refuses (C0/C1
 * controls but tab, LF, CR and NEL; U+FFFE/U+FFFF; unpaired surrogates), or -1. A loop over
 * the range only: a regex would scan on to the end of the whole source on every call.
 */
function nonPrintable(src: string, start: number, end: number): number {
  for (let i = start; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c < SPACE) {
      if (c !== TAB && c !== LF && c !== CR) return i;
    } else if (c >= ASCII_MAX && c <= C1_LAST) {
      if (c !== NEL) return i;
    } else if (c === REVERSED_BOM || c === BMP_LAST) {
      return i;
    } else if (c >= HIGH_SURROGATE_FIRST && c <= HIGH_SURROGATE_LAST) {
      const next = i + 1 < end ? src.charCodeAt(i + 1) : 0;
      if (next < LOW_SURROGATE_FIRST || next > LOW_SURROGATE_LAST) return i;
      i++;
    } else if (c >= LOW_SURROGATE_FIRST && c <= LOW_SURROGATE_LAST) {
      return i;
    }
  }
  return -1;
}

function leading(s: string): number {
  return s.length - s.trimStart().length;
}

/** One read of one YAML range. Lines keep their offsets into the original source. */
class Reader {
  /** Line text, with the fence indent removed. */
  readonly lines: string[] = [];
  /** Offset of `lines[i][0]` in the source. */
  readonly at: number[] = [];
  /** Offset where the raw line `i` starts (before the indent is removed). */
  readonly raw: number[] = [];
  i = 0;

  constructor(
    readonly src: string,
    readonly start: number,
    readonly end: number,
    indent: string,
    readonly diagnostics: Diagnostics
  ) {
    let pos = start;
    for (;;) {
      let e = lineEnd(src, pos);
      if (e > end) e = end;
      let text = src.slice(pos, e);
      let off = pos;
      if (indent && text.startsWith(indent)) {
        text = text.slice(indent.length);
        off += indent.length;
      }
      this.lines.push(text);
      this.at.push(off);
      this.raw.push(pos);
      if (e >= end) break;
      pos = e + (newlineAt(src, e) || 1);
    }
  }

  fail(message: string, start: number, end = start + 1, code = 'YAML_SYNTAX'): never {
    throw new YamlError(code, message, start, Math.max(end, start));
  }

  /** The range of line `i` without its indent. */
  lineRange(i: number): [number, number] {
    const text = this.lines[i] ?? '';
    const at = this.at[i] ?? this.end;
    return [at + leading(text), at + text.length];
  }

  skipBlank(): void {
    while (this.i < this.lines.length) {
      const t = (this.lines[this.i] ?? '').trim();
      // `---` is a document marker only at the start of a line; indented, it is text.
      if (t !== '' && t[0] !== '#' && (this.lines[this.i] ?? '') !== '---') break;
      this.i++;
    }
  }

  indent(): number {
    const line = this.lines[this.i] ?? '';
    let k = 0;
    while (k < line.length && line[k] === ' ') k++;
    if (line[k] === '\t') {
      const at = (this.at[this.i] ?? 0) + k;
      this.fail('tabs are not allowed for indentation', at);
    }
    return k;
  }

  /** Index of the line that contains `offset`. */
  lineOf(offset: number, from: number): number {
    let i = from;
    while (i + 1 < this.raw.length && (this.raw[i + 1] ?? Infinity) <= offset) i++;
    return i;
  }

  /** Store `value` under `key`, refusing duplicate keys and dropping prototype keys. */
  assign(target: YamlMap, key: string, value: YamlValue, start: number, end: number): void {
    if (UNSAFE_KEYS.has(key)) {
      this.diagnostics.warning(
        'YAML_UNSAFE_KEY',
        `The key \`${key}\` is not allowed and was ignored.`,
        { start, end }
      );
      return;
    }
    if (Object.hasOwn(target, key)) this.fail(`duplicated mapping key \`${key}\``, start, end);
    target[key] = value;
  }

  depth(depth: number, at: number): void {
    if (depth > MAX_YAML_DEPTH) {
      this.fail(`nesting is deeper than ${MAX_YAML_DEPTH} levels`, at, at + 1, 'YAML_TOO_DEEP');
    }
  }

  /** A plain scalar starting at `at`. */
  scalar(raw: string, at: number): YamlValue {
    const s = raw.trim();
    if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
    if (s === 'true' || s === 'True' || s === 'TRUE') return true;
    if (s === 'false' || s === 'False' || s === 'FALSE') return false;
    const c = s[0] ?? '';
    if (c === '!' || c === '&' || c === '*') {
      this.fail('tags, anchors and aliases (`!`, `&`, `*`) are not supported', at);
    }
    if (c === '@' || c === '`')
      this.fail(`\`${c}\` is reserved and cannot start a plain value`, at);
    if (c !== '-' && c !== '+' && c !== '.' && (c < '0' || c > '9')) return s;
    if (RE_INT.test(s) || RE_FLOAT.test(s)) return Number(s);
    if (RE_HEX.test(s) || RE_OCT.test(s) || RE_BIN.test(s)) {
      const neg = s.startsWith('-');
      const v = Number(neg || s.startsWith('+') ? s.slice(1) : s);
      return neg ? -v : v;
    }
    if (RE_INF.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
    if (RE_NAN.test(s)) return NaN;
    return s;
  }

  unquoteDouble(body: string, at: number): string {
    if (!body.includes('\\')) return fold(body);
    let out = '';
    const s = fold(lf(body).replace(/\\\n[ \t]*/g, ''));
    for (let i = 0; i < s.length; i++) {
      const ch = s[i] ?? '';
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      const e = s[++i] ?? '';
      if (e === 'x' || e === 'u' || e === 'U') {
        const len = HEX_ESCAPE_LENGTH[e];
        const hex = s.slice(i + 1, i + 1 + len);
        const code = /^[0-9a-fA-F]+$/.test(hex) && hex.length === len ? parseInt(hex, 16) : NaN;
        if (!(code <= 0x10ffff)) this.fail('invalid escape sequence in a double quoted value', at);
        out += String.fromCodePoint(code);
        i += len;
      } else if (e in ESCAPES) {
        out += ESCAPES[e];
      } else {
        this.fail('unknown escape sequence in a double quoted value', at);
      }
    }
    return out;
  }

  /** Characters that cannot start a plain value in a block (js-yaml readPlainScalar). */
  plainStart(text: string, at: number): void {
    const c = text[0];
    if (c === ']' || c === '}' || c === ',' || c === '%') {
      this.fail('bad indentation of a mapping entry', at);
    }
    if ((c === '?' || c === '-') && isSpaceOrBreak(text[1])) {
      this.fail('bad indentation of a mapping entry', at);
    }
    if (c === '|' || c === '>') this.fail('a line break is expected', at);
  }

  /** js-yaml: plain and block scalar text must be printable (comments are not checked). */
  printable(start: number, end: number): void {
    const bad = nonPrintable(this.src, start, end);
    if (bad >= 0) this.fail('the stream contains non-printable characters', bad);
  }

  /** js-yaml: quoted text may hold any character but C0 controls other than tab. */
  printableQuoted(start: number, end: number): void {
    for (let i = start; i < end; i++) {
      const c = this.src.charCodeAt(i);
      if (c < SPACE && c !== TAB && c !== LF && c !== CR) {
        this.fail('expected valid JSON character', i);
      }
    }
  }

  skip(pos: number, limit: number): number {
    const s = this.src;
    while (pos < limit) {
      const c = s[pos];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
        pos++;
      } else if (c === '#' && (pos === this.start || RE_SPACE.test(s[pos - 1] ?? ''))) {
        pos = Math.min(lineEnd(s, pos), limit);
      } else {
        break;
      }
    }
    return pos;
  }

  // Entries of a flow collection are separated by exactly one comma, as js-yaml requires.
  entryStart(pos: number, separated: boolean): void {
    if (!separated) this.fail('missed comma between flow collection entries', pos);
    if (this.src[pos] === ',') this.fail("expected the node content, but found ','", pos);
  }

  // Parses a flow value starting at `pos`, up to `limit`; returns the value and the offset after it.
  flow(pos: number, limit: number, stops: string, depth: number): [YamlValue, number] {
    const s = this.src;
    pos = this.skip(pos, limit);
    const ch = s[pos];
    const open = pos;
    if (pos < limit && (ch === '{' || ch === '[')) {
      this.depth(depth + 1, pos);
      const close = ch === '{' ? '}' : ']';
      const map: YamlMap = {};
      const list: YamlValue[] = [];
      pos++;
      let separated = true;
      for (;;) {
        pos = this.skip(pos, limit);
        if (pos >= limit) {
          this.fail(`this \`${ch}\` is never closed with \`${close}\``, open);
        }
        if (s[pos] === close) return [ch === '{' ? map : list, pos + 1];
        this.entryStart(pos, separated);
        if (ch === '{') {
          const keyAt = pos;
          let key: YamlValue;
          [key, pos] = this.flow(pos, limit, ':,}', depth + 1);
          const keyEnd = pos;
          pos = this.skip(pos, limit);
          let value: YamlValue = null;
          if (s[pos] === ':') [value, pos] = this.flow(pos + 1, limit, ',}', depth + 1);
          this.assign(map, String(key), value, keyAt, keyEnd);
        } else {
          let value: YamlValue;
          [value, pos] = this.flow(pos, limit, ',]', depth + 1);
          list.push(value);
        }
        pos = this.skip(pos, limit);
        separated = s[pos] === ',';
        if (separated) pos++;
      }
    }
    if (ch === '"') {
      let end = pos + 1;
      while (end < limit && s[end] !== '"') end += s[end] === '\\' ? 2 : 1;
      if (end >= limit) this.fail('this double quoted value is never closed', open);
      this.printableQuoted(pos + 1, end);
      return [this.unquoteDouble(s.slice(pos + 1, end), open), end + 1];
    }
    if (ch === "'") {
      let end = pos + 1;
      while (end < limit) {
        if (s[end] === "'") {
          if (s[end + 1] !== "'") break;
          end++;
        }
        end++;
      }
      if (end >= limit) this.fail('this single quoted value is never closed', open);
      this.printableQuoted(pos + 1, end);
      return [fold(s.slice(pos + 1, end)).replace(/''/g, "'"), end + 1];
    }
    let end = pos;
    // Inside a flow collection a plain value ends at any flow indicator (and in a mapping at
    // `: `), and
    // cannot start with a block indicator (js-yaml readPlainScalar).
    const inFlow = stops !== '';
    if (inFlow && (ch === '>' || ch === '|' || ch === '%')) {
      this.fail(`\`${ch}\` cannot start a plain value inside \`{…}\` or \`[…]\``, pos);
    }
    while (end < limit) {
      const c = s[end] ?? '';
      if (
        (stops.includes(c) ||
          (inFlow && ((c === ':' && stops.includes('}')) || RE_FLOW_INDICATOR.test(c)))) &&
        (c !== ':' || end + 1 >= limit || RE_FLOW_KEY_END.test(s[end + 1] ?? ''))
      ) {
        break;
      }
      if (c === '#' && end > pos && RE_SPACE.test(s[end - 1] ?? '')) {
        this.printable(pos, end);
        const value = this.scalar(fold(s.slice(pos, end).trim()), pos);
        return [value, Math.min(lineEnd(s, end), limit)];
      }
      end++;
    }
    this.printable(pos, end);
    return [this.scalar(fold(s.slice(pos, end).trim()), pos), end];
  }

  blockScalar(header: string, parentIndent: number): string {
    const folded = header.startsWith('>');
    let chomp = '';
    if (header.includes('-')) chomp = '-';
    else if (header.includes('+')) chomp = '+';
    const explicit = RE_INDENT_DIGIT.exec(header);
    let indent = explicit ? parentIndent + Number(explicit[0]) : -1;
    const out: string[] = [];
    while (this.i < this.lines.length) {
      const line = this.lines[this.i] ?? '';
      if (line.trim() === '') {
        out.push('');
        this.i++;
        continue;
      }
      const k = leading(line);
      if (indent === -1) {
        if (k <= parentIndent) break;
        indent = k;
      }
      if (k < indent) break;
      const lineAt = this.at[this.i] ?? 0;
      this.printable(lineAt, lineAt + line.length);
      out.push(line.slice(indent));
      this.i++;
    }
    let trailing = 0;
    while (out.length > 0 && out[out.length - 1] === '') {
      out.pop();
      trailing++;
    }
    let text: string;
    if (folded) {
      text = '';
      for (let i = 0; i < out.length; i++) {
        const cur = out[i] ?? '';
        if (i > 0) {
          const prev = out[i - 1] ?? '';
          if (cur === '') text += '\n';
          else if (prev !== '') {
            text += RE_LEADING_BLANK.test(prev) || RE_LEADING_BLANK.test(cur) ? '\n' : ' ';
          }
        }
        text += cur;
      }
    } else {
      text = out.join('\n');
    }
    if (out.length === 0) return chomp === '+' ? '\n'.repeat(trailing) : '';
    if (chomp === '-') return text;
    if (chomp === '+') return text + '\n'.repeat(trailing + 1);
    return text + '\n';
  }

  /** The value after `key:` or `- `, starting at offset `at`; line `this.i - 1` holds it. */
  inlineValue(rest: string, at: number, indent: number, depth: number): YamlValue {
    const first = rest[0];
    if ((first === '|' || first === '>') && RE_BLOCK_HEADER.test(rest)) {
      return this.blockScalar(rest, indent);
    }
    if (first === '{' || first === '[' || first === '"' || first === "'") {
      // The value may continue on later lines: read it straight from the source.
      const [value, end] = this.flow(at, this.end, '', depth);
      const line = this.lineOf(end, this.i - 1);
      const tailEnd = Math.min(lineEnd(this.src, end), this.end);
      const tail = stripComment(this.src.slice(end, tailEnd));
      if (tail.trim() !== '') {
        const from = end + leading(tail);
        this.fail('unexpected content after a value', from, end + tail.trimEnd().length);
      }
      this.i = line + 1;
      return value;
    }
    const body = stripComment(rest);
    let text = body.trim();
    this.printable(at, at + text.length);
    this.plainStart(text, at);
    const indicator = mappingIndicator(text, true);
    // `k: a: b` or `k: a:` at a line end: js-yaml reads a second mapping entry and fails.
    if (indicator >= 0) this.fail('bad indentation of a mapping entry', at + indicator);
    // js-yaml: a comment ends a plain value; more of it after the comment is an error.
    let commented = body.length < rest.length;
    while (this.i < this.lines.length) {
      const line = this.lines[this.i] ?? '';
      if (line.trim() === '') {
        let j = this.i;
        while (j < this.lines.length && (this.lines[j] ?? '').trim() === '') j++;
        if (j >= this.lines.length || leading(this.lines[j] ?? '') <= indent) break;
        text += '\n'.repeat(j - this.i);
        this.i = j;
        continue;
      }
      if (leading(line) <= indent) break;
      const from = this.lineRange(this.i)[0];
      if (line[0] === '\t') this.fail('tab characters must not be used in indentation', from - 1);
      if (line.trimStart()[0] === '#') {
        commented = true;
        this.i++;
        continue;
      }
      if (commented) this.fail('bad indentation of a mapping entry', from);
      const lineBody = stripComment(line);
      const more = lineBody.trim();
      if (lineBody.length < line.length) commented = true;
      const colon = mappingIndicator(more, false);
      if (colon >= 0) {
        // A `key:` line is reported from its start, other text at the `:`.
        const where = splitKey(more) !== null ? from : from + colon;
        this.fail('bad indentation of a mapping entry', where);
      }
      this.printable(from, from + more.length);
      text += (text.endsWith('\n') ? '' : ' ') + more;
      this.i++;
    }
    // Blank lines kept for a continuation that never came are not part of the value.
    let cut = text.length;
    while (cut > 0 && text.charCodeAt(cut - 1) === LF) cut--;
    text = text.slice(0, cut);
    return this.scalar(text, at);
  }

  block(minIndent: number, depth: number): YamlValue {
    this.skipBlank();
    if (this.i >= this.lines.length) return null;
    const indent = this.indent();
    if (indent < minIndent) return null;
    const lineAt = (this.at[this.i] ?? 0) + indent;
    this.depth(depth + 1, lineAt);
    const line = (this.lines[this.i] ?? '').slice(indent);

    if (isSeqItem(line)) {
      const out: YamlValue[] = [];
      while (this.i < this.lines.length) {
        this.skipBlank();
        if (this.i >= this.lines.length || this.indent() !== indent) break;
        const cur = (this.lines[this.i] ?? '').slice(indent);
        if (!isSeqItem(cur)) break;
        const rest = cur.slice(1);
        const pad = leading(rest) + 1;
        const restAt = (this.at[this.i] ?? 0) + indent + pad;
        const body = stripComment(rest).trim();
        if (body === '') {
          this.i++;
          out.push(this.block(indent + 1, depth + 1));
        } else if (splitKey(body) !== null || isSeqItem(body)) {
          // `- key: value` and `- - x` open a collection at the column after `- `
          // (the rewritten line keeps its length, so offsets stay valid).
          this.lines[this.i] = ' '.repeat(indent + pad) + rest.trimStart();
          out.push(this.block(indent + pad, depth + 1));
        } else {
          this.i++;
          out.push(this.inlineValue(rest.trim(), restAt, indent, depth + 1));
        }
      }
      return out;
    }

    if (splitKey(line) === null) {
      this.i++;
      // A plain scalar continues on any line indented more than its parent node.
      return this.inlineValue(line.trim(), lineAt, minIndent - 1, depth);
    }

    const out: YamlMap = {};
    while (this.i < this.lines.length) {
      this.skipBlank();
      if (this.i >= this.lines.length) break;
      const k = this.indent();
      if (k < indent) break;
      if (k > indent) this.fail('bad indentation of a mapping entry', ...this.lineRange(this.i));
      const cur = (this.lines[this.i] ?? '').slice(indent);
      const km = splitKey(cur);
      if (!km) this.fail('can not read a block mapping entry', ...this.lineRange(this.i));
      const keyAt = (this.at[this.i] ?? 0) + indent;
      const keyEnd = keyAt + km.key.length;
      const key = String(this.flow(keyAt, keyEnd, '', depth)[0]);
      const rest = cur.slice(km.length);
      const restAt = keyAt + km.length;
      this.i++;
      let value: YamlValue = null;
      if (stripComment(rest).trim() === '') {
        this.skipBlank();
        if (this.i < this.lines.length) {
          const next = this.indent();
          const seq = isSeqItem((this.lines[this.i] ?? '').slice(next));
          if (next > indent || (seq && next === indent)) {
            value = this.block(seq ? indent : indent + 1, depth + 1);
          }
        }
      } else {
        value = this.inlineValue(rest.trim(), restAt, indent, depth + 1);
      }
      this.assign(out, key, value, keyAt, keyEnd);
    }
    return out;
  }

  read(): YamlValue {
    const from = this.skip(this.start, this.end);
    const ch = this.src[from];
    if (from < this.end && (ch === '{' || ch === '[')) {
      const [value, end] = this.flow(from, this.end, '', 0);
      if (this.skip(end, this.end) >= this.end) return value;
    }
    const value = this.block(0, 0);
    this.skipBlank();
    if (this.i < this.lines.length && (this.lines[this.i] ?? '').trim() !== '...') {
      this.fail('end of the stream or a document separator is expected', ...this.lineRange(this.i));
    }
    return value;
  }
}

/**
 * Read the YAML in `src` (or in `[options.start, options.end)` of it) with js-yaml's JSON
 * schema semantics. Never throws: errors come back as diagnostics with ranges into `src`.
 */
export function parseYaml(src: string, options: YamlOptions = {}): YamlResult {
  const start = options.start ?? 0;
  const end = options.end ?? src.length;
  const diagnostics = new Diagnostics();
  const reader = new Reader(src, start, end, options.indent ?? '', diagnostics);
  try {
    const nul = src.indexOf('\0', start);
    if (nul >= 0 && nul < end) reader.fail('null byte is not allowed in input', nul);
    return { value: reader.read(), diagnostics: diagnostics.list };
  } catch (err) {
    if (!(err instanceof YamlError)) throw err;
    diagnostics.error(err.code, `Invalid YAML: ${err.message}.`, {
      start: err.start,
      end: err.end,
    });
    return { value: null, diagnostics: diagnostics.list };
  }
}
