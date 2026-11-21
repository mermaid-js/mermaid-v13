/**
 * The inline Markdown the service writes in hover and completion docs: `**strong**` and code
 * spans, which may be fenced with several backticks when the code holds one (flowchart's
 * `code()` in facet/tables.ts). Adapters render the parts: CodeMirror as DOM, the LSP server
 * as plain text for a client without Markdown.
 *
 * And the Mermaid fences of a Markdown document (`mermaidFences`), for a host that runs the
 * service on each fence body and maps offsets by the body's start: the LSP server on opt-in
 * (D581), or any Markdown editor (#180).
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

/** A Mermaid fence of a Markdown document (#180, #811). */
export interface MermaidFence {
  /** Offset in the Markdown text of the body's first character: the line after the opening fence. */
  readonly start: number;
  /** The body as written, its indent and line ends kept, up to the closing fence's line. */
  readonly text: string;
}

/** An opening fence: indent, then three or more backticks or tildes, then the info string. */
const OPENING = /^[ \t]*(`{3,}|~{3,})(.*)$/;
/** A closing fence: indent, a run of backticks or tildes, nothing after it but blanks. */
const CLOSING = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

/** Whether `line` closes a fence opened with `fence`: its own character, at least as long. */
function closes(line: string, fence: string): boolean {
  const run = CLOSING.exec(line)?.[1];
  return run !== undefined && run.startsWith(fence.charAt(0)) && run.length >= fence.length;
}

/** The fence `line` opens, and whether its info string names mermaid, or undefined. */
function opening(line: string): { fence: string; mermaid: boolean } | undefined {
  const m = OPENING.exec(line);
  if (!m) return undefined;
  const fence = m[1]!;
  const info = m[2]!;
  // A backtick fence's info string may not hold a backtick (CommonMark): that line is prose.
  if (fence.startsWith(BACKTICK) && info.includes(BACKTICK)) return undefined;
  return { fence, mermaid: info.trim().split(/\s/)[0]!.toLowerCase() === 'mermaid' };
}

/**
 * The fenced code blocks of `markdown` whose info string starts with `mermaid` (in any case),
 * with backticks or tildes and any indent (a fence inside a list item is indented). Each body
 * keeps its text as written, so an offset in it plus `start` is the offset in `markdown`. A
 * fence closes at a line holding only a run of its own character at least as long; one never
 * closed runs to the end of the text. A Mermaid fence quoted inside another fence is code of
 * that fence, not a fence. Fences inside a block quote are not read.
 */
export function mermaidFences(markdown: string): MermaidFence[] {
  const out: MermaidFence[] = [];
  let open: { fence: string; mermaid: boolean; start: number } | undefined;
  for (const { line, at, next } of linesOf(markdown)) {
    if (!open) {
      const fence = opening(line);
      if (fence) open = { ...fence, start: next };
    } else if (closes(line, open.fence)) {
      if (open.mermaid) out.push({ start: open.start, text: markdown.slice(open.start, at) });
      open = undefined;
    }
  }
  if (open?.mermaid) out.push({ start: open.start, text: markdown.slice(open.start) });
  return out;
}

/** Each line of `text` without its line end, its start, and where the next line starts. */
function linesOf(text: string): { line: string; at: number; next: number }[] {
  const out = [];
  for (let at = 0; ; ) {
    const newline = text.indexOf('\n', at);
    if (newline < 0) {
      out.push({ line: text.slice(at).replace(/\r$/, ''), at, next: text.length });
      return out;
    }
    out.push({ line: text.slice(at, newline).replace(/\r$/, ''), at, next: newline + 1 });
    at = newline + 1;
  }
}
