/**
 * Line counts for the size report (#814, spec #813): "lines" are non-blank, non-comment lines of
 * the non-spec `.ts` files under `packages/*\/src`, the measure spec #813's table uses.
 *
 * A line counts when a token of the TypeScript syntax tree starts, ends or continues on it, so a
 * multi-line string or template counts on every line, and a regular expression that holds `//`
 * or `/*` is read as code. Comments, doc comments included, are trivia and never count.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/** Non-blank, non-comment lines of one TypeScript source. */
export function countCodeLines(text: string): number {
  const file = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const lines = new Set<number>();
  const lineOf = (pos: number) => file.getLineAndCharacterOfPosition(pos).line;
  const visit = (node: ts.Node): void => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode)
      return;
    const children = node.getChildren(file);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    // Empty lists and the end-of-file token have no text.
    const start = node.getStart(file);
    if (start >= node.end) return;
    const last = lineOf(node.end);
    for (let line = lineOf(start); line <= last; line++) lines.add(line);
  };
  visit(file);
  return lines.size;
}

/** A counted source file: its path from the repository root, and its package folder. */
export interface SourceFile {
  /** `packages/<folder>/src/…`, with `/` separators. */
  path: string;
  /** The folder under `packages/`. */
  pkg: string;
}

const counted = (name: string) =>
  name.endsWith('.ts') && !name.endsWith('.spec.ts') && !name.endsWith('.d.ts');

/**
 * Every file the report counts under `root` (a repository checkout): the `.ts` files below each
 * `packages/<folder>/src`, without specs and declaration files, sorted by path.
 */
export function listSourceFiles(root: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string, rel: string, pkg: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(join(dir, e.name), `${rel}/${e.name}`, pkg);
      } else if (counted(e.name)) out.push({ path: `${rel}/${e.name}`, pkg });
    }
  };
  for (const e of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const src = join(root, 'packages', e.name, 'src');
    let found = true;
    try {
      readdirSync(src);
    } catch {
      found = false;
    }
    if (found) walk(src, `packages/${e.name}/src`, e.name);
  }
  // Paths are unique.
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** {@link countCodeLines} of a file under `root`. */
export function countFileLines(root: string, path: string): number {
  return countCodeLines(readFileSync(join(root, path), 'utf8'));
}
