/**
 * The text v12's `detectType` ran every detector on (`diagram-api/detectType.ts` at 12.2.0): the
 * text after the front matter, with each directive removed as v12's `directiveRegex` removed it, then
 * `stripAnyComments` (`diagram-api/regexes.ts`), which replaces each `\s*%%.*\n` run with a line
 * break and leaves a `%%` with no line break after it alone. The first-party rows try it when
 * the raw body does not match (`registry.ts`), so `cynefin-beta%% c` plus a line break is
 * cynefin, as in v12, and `cynefin-beta%% c` alone is not.
 */

/** One character, tested against the class `\s` means in v12's regexes. */
const WHITESPACE = /\s/;
const WORD = /\w/;

/**
 * v12's directive removal, `text.replace(directiveRegex, '')` with its
 * `/%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi`, as a linear
 * scanner (the pattern's nested quantifier backtracks). A match is `%%{`, blanks, a word
 * (with `:` after it, blanks allowed, taken too), blanks, then either a word or everything up
 * to `}%%` or a character `.` does not match (a lone CR, U+2028, U+2029; CRLF and LF are
 * taken), then blanks and the `}%%` if it is there. Every part after the first word is
 * optional, so the greedy reading is the match. `%%{` without a word after it is no match.
 */
function stripDirectives(text: string): string {
  const run = (from: number, set: RegExp): number => {
    let i = from;
    while (i < text.length && set.test(text[i]!)) i++;
    return i;
  };
  const blanks = (from: number): number => run(from, WHITESPACE);
  const word = (from: number): number => run(from, WORD);
  const close = (at: number): number => (text.startsWith('}%%', at) ? at + 3 : at);
  let out = '';
  let kept = 0;
  let from = 0;
  for (let p = text.indexOf('%%{', from); p !== -1; p = text.indexOf('%%{', from)) {
    const name = blanks(p + 3);
    let at = word(name);
    if (at === name) {
      from = p + 1;
      continue;
    }
    const colon = blanks(at);
    if (text[colon] === ':') at = colon + 1;
    at = blanks(at);
    const value = word(at);
    if (value > at) at = close(blanks(value));
    else {
      while (at < text.length && !text.startsWith('}%%', at)) {
        const c = text[at];
        if (c === '\n') at++;
        else if (c === '\r' && text[at + 1] === '\n') at += 2;
        else if (c === '\r' || c === '\u2028' || c === '\u2029') break;
        else at++;
      }
      at = close(blanks(at));
    }
    out += text.slice(kept, p);
    kept = at;
    from = at;
  }
  return out + text.slice(kept);
}

/** v12's `stripAnyComments`: `text.replace(/\s*%%.*\n/gm, '\n')` in linear time. */
function stripAnyComments(text: string): string {
  let out = '';
  let consumed = 0;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const marker = text.indexOf('%%', searchFrom);
    if (marker === -1) break;
    const lineEnd = text.indexOf('\n', marker);
    if (lineEnd === -1) break;
    let start = marker;
    while (start > consumed && WHITESPACE.test(text[start - 1]!)) start--;
    out += text.slice(consumed, start) + '\n';
    consumed = lineEnd + 1;
    searchFrom = consumed;
  }
  return out + text.slice(consumed);
}

/** v12's detector text for `src`, whose body (after any front matter) starts at `bodyStart`. */
export function v12DetectText(src: string, bodyStart: number): string {
  return stripAnyComments(stripDirectives(src.slice(bodyStart)));
}
