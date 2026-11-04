/**
 * The text v12's state lexer saw, built on the parser kit's v12 source view (D114,
 * `sourceView` in `@mermaid-js/core/parser-kit`): the kit finds the comment lines,
 * directives, dropped `;` and HTML-attribute quotes; this adds what only state's pipeline
 * did, the `trimStart` after comments were removed and the appended `\n`, and reads CRLF as
 * LF and the marked quotes as `'`. Every character keeps its source offset, so each token
 * maps back to a source range; the source is never rewritten. Linear (R-PARSE-7).
 */
import {
  CR,
  isSpace,
  LF,
  localOffset,
  QUOTE,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Range } from '@mermaid-js/core/parser-kit';

const APOSTROPHE = 39;

export interface StateView {
  /** The text v12's lexer saw, entities still as `#name;`, plus the appended `\n`. */
  text: string;
  /** `at[i]`: the source offset of `text[i]`; `at[text.length]` is the source length. */
  at: Uint32Array;
  /** Comment lines and directives, which the lexer reports as trivia, in source order. */
  removed: Hole[];
  /** Source offsets of the `;` v12 dropped (the end of a `style` / `classDef` line). */
  drops: ReadonlySet<number>;
}

/** The state view of `src[from…]`; `directives` are the `%%{…}%%` ranges from preprocess. */
export function stateView(src: string, from: number, directives: readonly Range[]): StateView {
  const kit = sourceView(src, from, directives);
  const { text, mask } = kit;
  const offsets = kit.runs ? new SourceOffsets(kit.runs) : undefined;
  const codes: number[] = [];
  const at: number[] = [];
  let lead = true;
  for (let i = localOffset(kit, from); i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (lead && isSpace(c)) {
      if (c === CR && text.charCodeAt(i + 1) === LF) i++;
      continue;
    }
    lead = false;
    const s = offsets ? offsets.source(i) : i;
    if (c === CR) {
      c = LF;
      if (text.charCodeAt(i + 1) === LF) i++;
    } else if (((mask?.[s] ?? 0) & QUOTE) !== 0) c = APOSTROPHE;
    codes.push(c);
    at.push(s);
  }
  codes.push(LF);
  at.push(src.length, src.length);
  let out = '';
  for (let i = 0; i < codes.length; i += 4096) {
    out += String.fromCharCode(...codes.slice(i, i + 4096));
  }
  const removed: Hole[] = [];
  const drops = new Set<number>();
  for (const h of kit.holes) {
    if (h.kind === 'drop') drops.add(h.start);
    else removed.push(h);
  }
  return { text: out, at: Uint32Array.from(at), removed, drops };
}
