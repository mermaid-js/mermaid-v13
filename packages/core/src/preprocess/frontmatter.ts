/**
 * The shared front-matter parser (DESIGN §4.1). A line scanner finds the opening `---` on the
 * first line that is not blank, a `%%` comment or a whole directive (D704), and the closing `---`
 * at the same indent; the YAML between them is read in place. Nothing is rewritten and every
 * range is an offset into the original source. A byte order mark as the first character is
 * skipped, not read as the fence's indent (D642).
 */
import { BOM, CR, LF, LBRACE } from '../parser-kit/char-codes.ts';
import { isSpace } from '../parser-kit/chars.ts';
import type { Diagnostics } from '../parser-kit/diagnostics.ts';
import type { Range } from '../parser-kit/positions.ts';
import { lineEnd, newlineAt } from '../parser-kit/scanner.ts';
import { simpleConfig } from './frontmatter-config.ts';
import { isYamlMap, parseYaml } from './yaml.ts';
import type { YamlMap, YamlValue } from './yaml.ts';

export interface FrontMatter {
  /** The whole block, from the opening fence to the end of the closing fence's line break. */
  range: Range;
  /** The YAML text between the fences. */
  yamlRange: Range;
  /** The parsed YAML document (`null` when it is empty, not a mapping, or invalid). */
  data: YamlMap | null;
  /** `title`, as v12 reads it: any truthy value, as a string. */
  title?: string;
  /**
   * `config` as written (a plain, unmerged object), with the legacy top-level `displayMode`
   * moved to `gantt.displayMode` as in v12. Config resolution (merge, secure keys) is not done here.
   */
  config?: Record<string, unknown>;
}

export interface FrontMatterScan {
  frontMatter?: FrontMatter;
  /** Where the diagram text starts (after the front matter, or 0 when there is none). */
  bodyStart: number;
  /**
   * Where the opening fence's line starts (0 when there is no fence). Blank, `%%` comment and
   * directive lines may come before it (D704); directives there are still read (D705).
   */
  fenceStart: number;
}

/** Horizontal whitespace as v12's fence regex sees it (`\s` without line breaks). */
function isHSpace(c: number): boolean {
  return c !== 10 && c !== 13 && isSpace(c);
}

/** End of the run of horizontal whitespace starting at `at`. */
function hspace(src: string, at: number): number {
  let i = at;
  while (i < src.length && isHSpace(src.charCodeAt(i))) i++;
  return i;
}

/** Offset after the line break at `at` (or `at` itself at the end of the source). */
function nextLine(src: string, at: number): number {
  return at + newlineAt(src, at);
}

/** True when the line `[start, end)` is `indent---` plus trailing horizontal whitespace. */
function isFence(src: string, start: number, end: number, indent: string): boolean {
  if (!src.startsWith(indent, start)) return false;
  const dash = start + indent.length;
  if (!src.startsWith('---', dash)) return false;
  return hspace(src, dash + 3) === end;
}

/**
 * When the line at `start` is blank, a `%%` comment, or one directive closed on the same line
 * with nothing after it, the offset of the next line; otherwise -1. A line that ends the
 * source is never skipped: no fence can follow it.
 */
function skippableLine(src: string, start: number): number {
  const first = hspace(src, start);
  const end = lineEnd(src, first);
  if (end >= src.length) return -1;
  if (end > first) {
    if (!src.startsWith('%%', first)) return -1;
    if (src.charCodeAt(first + 2) === LBRACE) {
      const close = src.indexOf('}%%', first + 3);
      if (close === -1 || close >= end || hspace(src, close + 3) !== end) return -1;
    }
  }
  return nextLine(src, end);
}

/** Find, read and interpret the front matter at the start of `src`. */
export function scanFrontMatter(src: string, diagnostics: Diagnostics): FrontMatterScan {
  // The opening fence is on the first line that is not blank, a `%%` comment or a whole
  // `%%{…}%%` directive (D704). A leading BOM is how the file was saved, not text: skip it,
  // or it would be the fence's indent and no closing `---` would match (D642).
  let lineStart = src.charCodeAt(0) === BOM ? 1 : 0;
  for (;;) {
    const next = skippableLine(src, lineStart);
    if (next === -1) break;
    lineStart = next;
  }
  const dash = hspace(src, lineStart);
  const openEnd = lineEnd(src, dash);
  const indent = src.slice(lineStart, dash);
  if (!isFence(src, lineStart, openEnd, indent)) return { bodyStart: 0, fenceStart: 0 };

  const opener: Range = { start: dash, end: dash + 3 };
  const yamlStart = nextLine(src, openEnd);
  let at = yamlStart;
  while (at < src.length) {
    const end = lineEnd(src, at);
    if (isFence(src, at, end, indent)) {
      const bodyStart = nextLine(src, end);
      return {
        bodyStart,
        fenceStart: lineStart,
        frontMatter: interpret(
          src,
          { start: lineStart, end: bodyStart },
          yamlStart,
          at,
          indent,
          diagnostics
        ),
      };
    }
    if (end >= src.length) break;
    at = nextLine(src, end);
  }

  diagnostics.error(
    'UNCLOSED_FRONT_MATTER',
    `The front matter is never closed. Add a line with ${indent ? 'the same indent and ' : ''}\`---\` after it.`,
    { start: src.length, end: src.length },
    { related: [{ message: 'The front matter starts here.', range: opener }] }
  );
  // The unclosed block runs to the end, like an unclosed string; nothing is left for the diagram.
  return { bodyStart: src.length, fenceStart: lineStart };
}

function interpret(
  src: string,
  range: Range,
  yamlStart: number,
  yamlEnd: number,
  indent: string,
  diagnostics: Diagnostics
): FrontMatter {
  // The YAML ends before the line break that precedes the closing fence.
  let end = yamlEnd;
  if (end > yamlStart && src.charCodeAt(end - 1) === LF) end--;
  if (end > yamlStart && src.charCodeAt(end - 1) === CR) end--;
  const yamlRange = { start: yamlStart, end };
  const simple = indent === '' ? simpleConfig(src, yamlStart, end) : undefined;
  const yaml = simple
    ? { value: simple, diagnostics: [] }
    : parseYaml(src, { start: yamlStart, end, indent });
  for (const d of yaml.diagnostics) diagnostics.list.push(d);

  const fm: FrontMatter = { range, yamlRange, data: null };
  const value = yaml.value;
  if (value === null) return fm;
  if (!isYamlMap(value)) {
    diagnostics.warning(
      'FRONT_MATTER_NOT_A_MAPPING',
      'The front matter should be a YAML mapping such as `title: …`; it was ignored.',
      yamlRange
    );
    return fm;
  }
  fm.data = value;
  const { title, config, displayMode } = value;
  // v12 keeps `title` and `displayMode` only when truthy, as strings.
  if (title) fm.title = String(title);
  if (config !== undefined && config !== null) {
    if (isYamlMap(config)) fm.config = config;
    else {
      diagnostics.warning(
        'FRONT_MATTER_CONFIG',
        'The front matter `config` should be a mapping of config keys; it was ignored.',
        yamlRange
      );
    }
  }
  if (displayMode) {
    const cfg = (fm.config ??= {});
    const gantt = cfg.gantt;
    if (gantt === undefined || gantt === null) cfg.gantt = { displayMode: String(displayMode) };
    else if (isYamlMap(gantt as YamlValue)) (gantt as YamlMap).displayMode = String(displayMode);
  }
  return fm;
}
