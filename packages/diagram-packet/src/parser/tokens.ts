/**
 * Packet token kinds. They mirror the token types of v12's Langium `packet.langium` (with
 * `common.langium`), so the lexer can be checked token by token against its Chevrotain lexer
 * (parser-method §1, D213). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `packet-beta` keyword (no boundary after it in v12). */
  PacketBeta: F,
  /** The `packet` keyword, followed by `%%`, a blank or the end. */
  Packet: F + 1,
  /** `-` between the two ends of a range. */
  Dash: F + 2,
  /** `+` before a bit count. */
  Plus: F + 3,
  Colon: F + 4,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 5,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 6,
  /** `title …` to `%%` or the line end, with the blanks before it. */
  Title: F + 7,
  /** A bit number or count: `0`, or `[1-9][0-9]*` not followed by `.`. */
  Int: F + 8,
  /** A `"…"` or `'…'` string; `\` escapes any character but a line end. */
  String: F + 9,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 10,
} as const;

/**
 * Trivia for the packet parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%`
 * comments are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12
 * removed before lexing.
 */
export const PACKET_TRIVIA = /* @__PURE__ */ kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.Yaml
);
