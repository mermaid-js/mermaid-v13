/**
 * mermaid\@12's box-drawing pass (`boxDrawingPreprocessor.ts` `preprocessBoxDrawing` at
 * `fa796a943`), ported as written: the grammar's lexer input after its rewrite (see the header of
 * `grammar/treeview.ebnf`). Dev and CI only, an independent reference: v13's own pass
 * (`src/parser/box.ts`) maps every character back to the source instead of rewriting strings,
 * and is gated against v12's by the lexer gate.
 */
const ALL_BOX_CHARS = /[─━│┃└┗├┣]/;
const BRANCH_CHAR = /[└┗├┣]/;
const DASH_CHAR = /[─━]/;
const DECORATION_ONLY = /^[\s│┃]+$/;
const METADATA_LINE = /^\s*(title[\t ]|accTitle[\t ]*:|accDescr[\t ]*[:{])/;
const COMMENT_LINE = /^\s*%%/;
const INDENT_UNIT = '    ';

function inferSegmentWidth(contentLines: string[]): number {
  for (const line of contentLines) {
    const match = BRANCH_CHAR.exec(line);
    if (match?.index && match.index > 0) return match.index;
  }
  return 4;
}

/**
 * One content line of v12's loop after its pass-through and decoration checks: its output
 * line, undefined when it is dropped, or v12's error.
 */
function boxLine(
  line: string,
  origLineNo: number,
  segmentWidth: number
): string | undefined | { kind: 'error'; message: string } {
  const normalized = line.replace(/\t/g, '    ');
  const branchMatch = BRANCH_CHAR.exec(normalized);
  if (branchMatch?.index !== undefined) {
    const branchCol = branchMatch.index;
    const depth = Math.round(branchCol / segmentWidth) + 1;
    let pos = branchCol + 1;
    while (pos < normalized.length && DASH_CHAR.test(normalized[pos] ?? '')) pos++;
    while (pos < normalized.length && normalized[pos] === ' ') pos++;
    const content = normalized.slice(pos).trimEnd();
    if (!content) {
      return {
        kind: 'error',
        message: `Line ${origLineNo}: Empty node — expected a filename or directory name after the box-drawing prefix`,
      };
    }
    return INDENT_UNIT.repeat(depth) + content;
  }
  if (/^[\s─━│┃└┗├┣]+$/.test(normalized)) return undefined;
  if (ALL_BOX_CHARS.test(normalized)) return line;
  if (/^\s+/.test(normalized)) {
    return {
      kind: 'error',
      message:
        `Line ${origLineNo}: Unexpected indentation without box-drawing characters. ` +
        `In box-drawing format, use ├── or └── prefixes for indented nodes.`,
    };
  }
  return line;
}

/** What v12's pass did: the text unchanged, the rewritten text, or its error message. */
export type BoxReference =
  | { kind: 'none' }
  | { kind: 'rewrite'; text: string }
  | { kind: 'error'; message: string };

export function boxReference(input: string): BoxReference {
  const lines = input.split('\n');
  const keywordIdx = lines.findIndex((line) => line.trim() === 'treeView-beta');
  if (keywordIdx === -1) return { kind: 'none' };
  const contentLineTexts: string[] = [];
  for (let i = keywordIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || COMMENT_LINE.test(line) || METADATA_LINE.test(line)) continue;
    if (DECORATION_ONLY.test(line)) continue;
    contentLineTexts.push(line.replace(/\t/g, '    '));
  }
  if (!contentLineTexts.some((line) => ALL_BOX_CHARS.test(line))) return { kind: 'none' };
  const segmentWidth = inferSegmentWidth(contentLineTexts);
  const out: string[] = lines.slice(0, keywordIdx + 1);
  for (let i = keywordIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const origLineNo = i + 1;
    if (line.trim() === '' || COMMENT_LINE.test(line) || METADATA_LINE.test(line)) {
      out.push(line);
      continue;
    }
    if (DECORATION_ONLY.test(line)) continue;
    const done = boxLine(line, origLineNo, segmentWidth);
    if (typeof done === 'object') return done;
    if (done !== undefined) out.push(done);
  }
  return { kind: 'rewrite', text: out.join('\n') };
}
