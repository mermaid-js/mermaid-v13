/**
 * What the facet adds to the parser's output for the language service (DESIGN §4.5, R-LANG-8):
 * section and task symbols beside the parser's actor symbols, and section blocks for folding.
 * The parser (T2) stays as it is; only the facet's `parse` reads these.
 *
 * - A `section` line is a `section` symbol over its name, a task a `task` symbol over its name,
 *   blanks off both ends (the model keeps them: v12 did not trim). The first line with a name
 *   defines it, later ones refer to it, as the AST ids `s:<name>@2` count them. A name written
 *   otherwise than v12 read it (an entity, a directive inside it) gets the statement's range,
 *   which the service leaves out, as the parser does for such an actor.
 * - A section line opens a block that holds every statement after it up to the next section
 *   line, so a section folds from its `section` line to its last task (journey has no closer).
 */
import type { Range, StatementSpan, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import type { JourneyDocument } from '../parser/ast.ts';
import type { JourneyParseResult } from '../parser/index.ts';

const SECTION = 'section'.length;

/**
 * The source range of `name` (trimmed) written in `text` from `from` after blanks only, else
 * the statement's `range` (the service drops such an occurrence: its text is not the name).
 */
function nameAt(text: string, from: number, range: Range, name: string): Range | undefined {
  if (name === '') return undefined;
  let at = from;
  while (at < range.end && /\s/.test(text.charAt(at))) at++;
  if (at + name.length > range.end || !text.startsWith(name, at)) return range;
  return { start: at, end: at + name.length };
}

/** Section and task symbols of `ast`, in source order. */
export function sectionAndTaskSymbols(text: string, ast: JourneyDocument): SymbolOccurrence[] {
  const out: SymbolOccurrence[] = [];
  const seen = new Set<string>();
  const add = (kind: string, name: string, range: Range | undefined) => {
    if (!range) return;
    const key = `${kind}\u0000${name}`;
    out.push({ name, kind, range, role: seen.has(key) ? 'ref' : 'def' });
    seen.add(key);
  };
  for (const n of ast.children) {
    if (n.type === 'Section') {
      const name = n.name.trim();
      add('section', name, nameAt(text, n.range.start + SECTION, n.range, name));
    } else if (n.type === 'Task') {
      const name = n.name.trim();
      add('task', name, nameAt(text, n.range.start, n.range, name));
    }
  }
  return out;
}

/** `spans` with each section line made a block of the statements after it. */
export function sectionBlocks(spans: readonly StatementSpan[]): StatementSpan[] {
  const out: StatementSpan[] = [];
  let block: StatementSpan | undefined;
  for (const s of spans) {
    if (s.kind === 'section') {
      block = { kind: 'section', range: { ...s.range } };
      out.push(block);
    } else if (block) {
      (block.children ??= []).push(s);
      block.range.end = s.range.end;
    } else out.push(s);
  }
  return out;
}

/** The parse as the language service reads it: {@link sectionAndTaskSymbols}, section blocks. */
export function forService(text: string, r: JourneyParseResult): JourneyParseResult {
  return {
    ...r,
    symbols: [...r.symbols, ...sectionAndTaskSymbols(text, r.ast)],
    statements: sectionBlocks(r.statements),
  };
}
