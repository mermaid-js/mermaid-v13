/**
 * The inline Markdown the service writes in hover and completion docs: `**strong**` and code
 * spans, which may be fenced with several backticks when the code holds one (flowchart's
 * `code()` in facet/tables.ts). Adapters render the parts: CodeMirror as DOM, the LSP server
 * as plain text for a client without Markdown.
 */

export interface InlinePart {
  readonly kind: 'text' | 'strong' | 'code';
  readonly text: string;
}

const BACKTICK = '`';

/** Length of the backtick run at `at`. */
function runAt(text: string, at: number): number {
  let end = at;
  while (text[end] === BACKTICK) end++;
  return end - at;
}

/** Start of the next run of exactly `length` backticks from `from`, or -1. */
function closingRun(text: string, from: number, length: number): number {
  for (let at = text.indexOf(BACKTICK, from); at >= 0; ) {
    const run = runAt(text, at);
    if (run === length) return at;
    at = text.indexOf(BACKTICK, at + run);
  }
  return -1;
}

/** Split `text` into plain text, strong and code parts (CommonMark code-span rules). */
export function inlineMarkdown(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ kind: 'text', text: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] === BACKTICK) {
      const run = runAt(text, i);
      const close = closingRun(text, i + run, run);
      if (close < 0) {
        plain += text.slice(i, i + run);
        i += run;
        continue;
      }
      let code = text.slice(i + run, close);
      // One space of padding on each side is dropped, unless the code is all spaces.
      if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '')
        code = code.slice(1, -1);
      flush();
      out.push({ kind: 'code', text: code });
      i = close + run;
      continue;
    }
    if (text.startsWith('**', i)) {
      const close = text.indexOf('**', i + 2);
      if (close > i + 2) {
        flush();
        out.push({ kind: 'strong', text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  flush();
  return out;
}
