/**
 * Value conversion for the venn parser (parser-method §4): v12's `normalizeText`, D416's title
 * quotes, AST id escaping (D418), and how messages write ids and lists.
 */

/**
 * `%`, `>`, `@`, `#` and `+` percent-encoded (the separators of venn ids), and so are the
 * characters XML 1.0 cannot hold (C0 controls but tab, LF and CR; DEL; lone surrogates; U+FFFE,
 * U+FFFF). Two hex digits up to U+007F, four above, so the encoding stays one-to-one.
 */
const ESCAPED = '%>@#+\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f\\ud800-\\udfff\\ufffe\\uffff';
const RE_NEEDS_ESC = new RegExp(`[${ESCAPED}]`, 'u');
const RE_ESC = new RegExp(`[${ESCAPED}]`, 'gu');
const TWO_DIGITS = 0x80;

/** An id as it goes into an AST id. */
export function esc(name: string): string {
  return RE_NEEDS_ESC.test(name)
    ? name.replace(RE_ESC, (c) => {
        const n = c.charCodeAt(0);
        return `%${n
          .toString(16)
          .toUpperCase()
          .padStart(n < TWO_DIGITS ? 2 : 4, '0')}`;
      })
    : name;
}

/** Whether `trimmed` is wrapped in one pair of `"`. */
function quoted(trimmed: string): boolean {
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
}

/** v12's `normalizeText`: trimmed, then one pair of surrounding `"` removed. */
export function normalizeText(text: string): string {
  const trimmed = text.trim();
  return quoted(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/** D416: one pair of surrounding quotes removed; any other title as v12 kept it. */
export function titleText(text: string): string {
  const trimmed = text.trim();
  return quoted(trimmed) ? trimmed.slice(1, -1) : text;
}

/** v12's id rule (`IDENTIFIER`). */
const BARE_ID = /^[A-Za-z_][A-Za-z0-9\-_]*$/;
/**
 * The keyword rules that come before `IDENTIFIER` in `venn.jison` and take a bare id's start:
 * `set`, `union`, `text`, `style` and `venn-beta`, each ended by `\b` and matched without regard
 * to case (`set-x` lexes `set` and then `-x`, which no rule takes; `Set` is the keyword), and
 * `title` followed by a blank or a line break (a title statement).
 */
const KEYWORD_FIRST = /^(?:(?:set|union|text|style|venn-beta)(?![A-Za-z0-9_])|title$)/i;

/** Whether `name` matches v12's `IDENTIFIER` rule (keywords aside). */
export const isIdentifier = (name: string): boolean => BARE_ID.test(name);

/** Whether `name` lexes as one id when written bare (v12's lexer). */
export function isBareId(name: string): boolean {
  return BARE_ID.test(name) && !KEYWORD_FIRST.test(name);
}

/** An id as a message writes it in a statement: bare when it lexes as an id, else quoted. */
export function idText(name: string): string {
  return isBareId(name) ? name : `"${name}"`;
}

/** `a`, `a and b`, `a, b and c`. */
export function listOf(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}
