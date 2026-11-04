/**
 * Value conversion as v12's `SequenceDB` did it (parser-method §3): `wrap:`/`nowrap:` prefixes
 * (`extractWrap`, `parseMessage`), message text (`text2`), box data (`parseBoxData`) and the
 * actor menu texts (`addLinks`, `addALink`, `addProperties`). Text is otherwise kept as written:
 * v12's `sanitizeText` runs when SVG is written, not here.
 */
import { isSpace, LPAREN } from '@mermaid-js/core/parser-kit';
import { isYamlMap, parseYaml } from '@mermaid-js/core/preprocess';
import { parseColor } from '@mermaid-js/core/theme';
import type { ParticipantKind } from '../model.ts';

/** Text and its `wrap:`/`nowrap:` prefix; `wrap` undefined follows the config. */
export interface Wrapped {
  text: string;
  wrap?: boolean;
}

/** v12 `extractWrap` on trimmed text: `wrap:`/`:wrap:` → true, `nowrap:`/`:nowrap:` → false. */
export function parseMessage(str: string): Wrapped {
  const t = str.trim();
  const colon = t.startsWith(':') ? 1 : 0;
  if (t.startsWith('wrap:', colon)) return { text: t.slice(colon + 5).trim(), wrap: true };
  if (t.startsWith('nowrap:', colon)) return { text: t.slice(colon + 7).trim(), wrap: false };
  return { text: t };
}

/** A message or note text: the `:` token's text (`text2`: trim, drop the `:`, parse). */
export function messageText(txt: string): Wrapped {
  return parseMessage(txt.trim().slice(1));
}

/** v12's own `CSS.supports('color', c)` answers, without a DOM. */
export function isCssColor(c: string): boolean {
  return parseColor(c) !== undefined || /^(?:currentcolor|inherit|initial|unset|revert)$/i.test(c);
}

const isWordChar = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isLineTerminator = (c: number) => c === 10 || c === 13 || c === 0x2028 || c === 0x2029;

export interface BoxData {
  /** Undefined when the box has no title. */
  text?: string;
  /** `transparent` when none or no valid colour was given. */
  color: string;
  wrap?: boolean;
}

/**
 * v12 `parseBoxData`: the colour first (`rgb(…)`, `rgba(…)`, `hsl(…)`, `hsla(…)` or a word),
 * the title after it. A first word that is not a CSS colour makes the whole text the title.
 * It ports `/^((?:rgba?|hsla?)\s*\(.*\)|\w*)(.*)$/` as a scan.
 */
export function parseBoxData(str: string): BoxData {
  let color = 'transparent';
  let title: string | undefined;
  let line = true;
  for (let i = 0; i < str.length; i++) if (isLineTerminator(str.charCodeAt(i))) line = false;
  if (line) {
    let split = -1;
    const fn = /^(?:rgba?|hsla?)/.exec(str);
    if (fn) {
      let j = fn[0].length;
      while (j < str.length && isSpace(str.charCodeAt(j))) j++;
      const close = str.lastIndexOf(')');
      if (str.charCodeAt(j) === LPAREN && close > j) split = close + 1;
    }
    if (split < 0) {
      split = 0;
      while (split < str.length && isWordChar(str.charCodeAt(split))) split++;
    }
    const head = str.slice(0, split);
    const tail = str.slice(split);
    if (head) color = head.trim();
    if (tail) title = tail.trim();
  }
  if (!isCssColor(color)) {
    color = 'transparent';
    title = str.trim();
  }
  if (title === undefined) return { color };
  const { text, wrap } = parseMessage(title);
  const out: BoxData = { color };
  if (text) out.text = text;
  if (wrap !== undefined) out.wrap = wrap;
  return out;
}

/** `&equals;` and `&amp;` back to `=` and `&`, as v12's menu statements did. */
const unescapeMenu = (text: string) => text.replace(/&equals;/g, '=').replace(/&amp;/g, '&');

/** `links A: {json}` and `properties A: {json}`: the JSON object, or undefined. */
export function menuJson(text: string, links: boolean): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(links ? unescapeMenu(text) : text);
    if (value !== null && typeof value === 'object' && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {
    // Not JSON: v12 logged the error and ignored the statement.
  }
  return undefined;
}

/** What `links`/`link`/`properties` carry (D105); undefined when the JSON is not an object. */
export function menuData(
  type: 'Links' | 'Link' | 'Properties' | 'Details',
  text: string
): { links?: Record<string, string>; properties?: Record<string, unknown> } | undefined {
  if (type === 'Details') return {};
  if (type === 'Link') return { links: menuLink(text) };
  const value = menuJson(text, type === 'Links');
  if (value === undefined) return undefined;
  if (type === 'Properties') return { properties: value };
  const links: Record<string, string> = {};
  for (const [k, v] of Object.entries(value))
    links[k] = typeof v === 'string' ? v : JSON.stringify(v);
  return { links };
}

/** `link A: label @ url`, split as v12's `addALink` did (the character before `@` is dropped). */
export function menuLink(text: string): Record<string, string> {
  const sep = text.indexOf('@');
  const t = unescapeMenu(text);
  return { [t.slice(0, sep - 1).trim()]: t.slice(sep + 1).trim() };
}

/** v12's participant types (`PARTICIPANT_TYPE`). */
export const KINDS: readonly ParticipantKind[] = [
  'participant',
  'actor',
  'boundary',
  'control',
  'entity',
  'database',
  'collections',
  'queue',
];

export interface ParticipantData {
  type?: ParticipantKind;
  alias?: string;
  /** The YAML error, when the data is not valid YAML. */
  error?: string;
  /** A `type` v12 does not know, as written (read as `participant`). */
  unknownType?: string;
}

/**
 * The `@{ … }` data: v12 read it as YAML (JSON schema), wrapped in braces when it is one line,
 * and took `type` and `alias` from it (DB:164–177).
 */
export function participantData(text: string): ParticipantData {
  const result = parseYaml(text.includes('\n') ? `${text}\n` : `{\n${text}\n}`);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) return { error: error.message };
  const value = result.value;
  if (!isYamlMap(value)) return {};
  const out: ParticipantData = {};
  const { type, alias } = value;
  if (typeof type === 'string' && (KINDS as readonly string[]).includes(type)) {
    out.type = type as ParticipantKind;
  } else if (type !== undefined && type !== null) {
    out.type = 'participant';
    out.unknownType = typeof type === 'string' ? type : JSON.stringify(type);
  }
  if (typeof alias === 'string' && alias !== '') out.alias = alias;
  return out;
}

/** `$$…$$` math in a message or note text (D105: kept as written, with a warning). */
export function hasMath(text: string): boolean {
  const a = text.indexOf('$$');
  return a >= 0 && text.includes('$$', a + 2);
}
