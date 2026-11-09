/**
 * v12's `stripLineTrailingCommas` (`agentflowDb.ts`, `fa796a943`): the multi-line `@{ … }` body
 * without the commas that end its lines, for the one retry v12 made when the body failed as
 * block YAML (D464). Commas inside quoted scalars, flow collections (`[ … ]`, `{ … }`) and
 * block scalar content stay; a comma right before a line-trailing `#` comment counts as
 * trailing. Linear in the body.
 */

/** What is open at the end of a line, across lines. */
interface Open {
  single: boolean;
  double: boolean;
  flowDepth: number;
}

/** Scans `line`, updating `open`; returns where a `#` comment starts, or -1. */
function scanLine(line: string, open: Open): number {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (open.double) {
      if (ch === '\\') i++;
      else if (ch === '"') open.double = false;
    } else if (open.single) {
      if (ch === "'") open.single = false;
    } else if (ch === '"') open.double = true;
    else if (ch === "'") open.single = true;
    else if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) return i;
    else if (ch === '[' || ch === '{') open.flowDepth++;
    else if (ch === ']' || ch === '}') open.flowDepth = Math.max(0, open.flowDepth - 1);
  }
  return -1;
}

export function stripLineTrailingCommas(body: string): string {
  const open: Open = { single: false, double: false, flowDepth: 0 };
  let blockScalarIndent: number | undefined;
  const out: string[] = [];
  for (const line of body.split('\n')) {
    if (blockScalarIndent !== undefined) {
      const indent = line.length - line.trimStart().length;
      if (line.trim() === '' || indent > blockScalarIndent) {
        // Block scalar content is verbatim text: commas are content.
        out.push(line);
        continue;
      }
      blockScalarIndent = undefined;
    }
    const commentStart = scanLine(line, open);
    if (open.single || open.double || open.flowDepth > 0) {
      // The line ends inside a quoted scalar or a flow collection: a comma there is content
      // or a separator, not a stray.
      out.push(line);
      continue;
    }
    const code = commentStart >= 0 ? line.slice(0, commentStart) : line;
    const comment = commentStart >= 0 ? line.slice(commentStart) : '';
    if (/:\s*[>|][\d+-]*\s*$/.test(code)) {
      // `key: |` or `key: >` opens a block scalar; its deeper lines are verbatim content.
      blockScalarIndent = line.length - line.trimStart().length;
      out.push(line);
      continue;
    }
    out.push(code.replace(/,([\t ]*)$/, '$1') + comment);
  }
  return out.join('\n');
}
