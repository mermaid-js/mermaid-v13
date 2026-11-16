/**
 * The documents the server holds, each as the parts the service analyses (D581). A Mermaid
 * document is one part, its whole text. A Markdown document is one part per Mermaid fence:
 * the fence body goes to the service under a uri of its own, and every offset of its answers
 * is moved by the body's start, so it lands on the Markdown text. Prose between fences belongs
 * to no part, and a request there gets no answer.
 */
import type { DocumentSnapshot, LanguageService } from '@mermaid-js/language-service';
import { LineIndex, mermaidFences } from '@mermaid-js/language-service';
import type { Positions } from './convert.ts';
import { shifted } from './convert.ts';

/** One text the service analyses: a whole Mermaid document, or one fence body. */
export interface Part {
  /** The uri the service holds the part under. */
  readonly key: string;
  /** Offset of the part's first character in the document text. */
  readonly start: number;
  /** The document line the part starts on (a fence body starts a line). */
  readonly line: number;
  readonly doc: DocumentSnapshot;
  /** The document's positions read from `start` on: part offsets in, document positions out. */
  readonly index: Positions;
}

export interface Open {
  readonly text: string;
  readonly version: number;
  readonly index: LineIndex;
  /** Whether the document is Markdown, served by its fences. */
  readonly markdown: boolean;
  readonly parts: readonly Part[];
}

/** The uri the service holds the `n`th fence of the Markdown document `uri` under. */
const fenceKey = (uri: string, n: number): string => `${uri}#mermaid-fence-${n}`;

/**
 * `text` of `uri` analysed: the whole text, or each Mermaid fence when `markdown`. The parts
 * of `previous` that are gone (a deleted fence) are closed in the service.
 */
export function analyse(
  service: LanguageService,
  uri: string,
  text: string,
  version: number,
  markdown: boolean,
  previous?: Open
): Open {
  const index = new LineIndex(text);
  const bodies = markdown ? mermaidFences(text) : [{ start: 0, text }];
  const parts = bodies.map((body, n): Part => {
    const key = markdown ? fenceKey(uri, n) : uri;
    return {
      key,
      start: body.start,
      line: index.position(body.start).line,
      // A facet whose parse throws gives a LANGUAGE_FACET_FAILED snapshot (the service guards it).
      doc: service.update(key, body.text),
      index: shifted(index, body.start),
    };
  });
  const kept = new Set(parts.map((p) => p.key));
  for (const p of previous?.parts ?? []) if (!kept.has(p.key)) service.close(p.key);
  return { text, version, index, markdown, parts };
}

/** Close every part of `open` in the service. */
export function forget(service: LanguageService, open: Open): void {
  for (const p of open.parts) service.close(p.key);
}

/**
 * The part holding the document offset `offset`, and the offset inside the part. A fence body
 * ends where its closing fence's line starts, so that line is outside; a part that runs to
 * the end of the text (a whole document, a fence never closed) holds the end too.
 */
export function partAt(open: Open, offset: number): { part: Part; offset: number } | undefined {
  for (const part of open.parts) {
    const local = offset - part.start;
    const length = part.doc.text.length;
    const toEnd = part.start + length === open.text.length;
    if (local >= 0 && (local < length || (local === length && toEnd)))
      return { part, offset: local };
  }
  return undefined;
}
