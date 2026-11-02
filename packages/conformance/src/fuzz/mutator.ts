/**
 * Seeded mutation fuzzing (R-SEC-7, R-TEST-8). Ported from Pele
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), tests/support/corpus.ts and the
 * FRAGMENTS list of tests/flowchart/oracle.test.ts @ 3a2f075. The generator and the edit mix
 * are Pele's; the fragments add v13's own hostile strings.
 */
import { PAYLOADS } from '@mermaid-js/core/svg/testing';

/** Pele's LCG: the same seed gives the same sequence on every engine. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * A generator of mutated inputs: each takes one corpus entry and makes 1–3 edits, each one of
 * insert a fragment (35%), delete 1–3 characters (25%), splice up to 20 characters from
 * another entry (15%), duplicate up to 6 characters (15%), or replace one character with a
 * fragment (10%).
 */
export function mutator(
  corpus: readonly string[],
  fragments: readonly string[],
  rnd: () => number
): () => string {
  if (corpus.length === 0 || fragments.length === 0) throw new RangeError('empty corpus');
  const pick = <X>(list: readonly X[]): X => list[Math.floor(rnd() * list.length)]!;
  return () => {
    let s = pick(corpus);
    const edits = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < edits; k++) {
      const pos = Math.floor(rnd() * (s.length + 1));
      const r = rnd();
      if (r < 0.35) {
        s = s.slice(0, pos) + pick(fragments) + s.slice(pos);
      } else if (r < 0.6) {
        s = s.slice(0, pos) + s.slice(pos + 1 + Math.floor(rnd() * 3));
      } else if (r < 0.75) {
        const other = pick(corpus);
        const from = Math.floor(rnd() * other.length);
        s = s.slice(0, pos) + other.slice(from, from + Math.floor(rnd() * 20)) + s.slice(pos);
      } else if (r < 0.9) {
        s = s.slice(0, pos) + s.slice(pos, pos + Math.floor(rnd() * 6)) + s.slice(pos);
      } else {
        s = s.slice(0, pos) + pick(fragments) + s.slice(pos + 1);
      }
    }
    return s;
  };
}

/** Flowchart tokens and constructs (Pele's list), then preprocess and hostile fragments. */
export const FLOWCHART_FRAGMENTS: readonly string[] = [
  ...[' ', '\n', ';', '-->', '---', '--', '==>', '===', '==', '-.->', '-.-', '-.', '.->', '~~~'],
  ...['--x', '--o', 'x--', 'o--', '<--', '<-->', '|', '[', ']', '(', ')', '{', '}', '((', '))'],
  ...['[[', ']]', '([', '])', '[(', ')]', '(((', ')))', '{{', '}}', '[/', '/]', '[\\', '\\]'],
  ...['>', '(-', '-)', '"', '`', '"`', '`"', '@', '@{', 'e1@', ':::', ':', '&', ' & ', ',', '*'],
  ...['#', '^', 'v', '-', '=', '.', '~', '<', '\\|', '[|', 'x', 'o', 'A', 'B', 'id1', '1', '23'],
  ...['text', 'é', 'ö', 'style ', 'classDef ', 'class ', 'click ', 'href ', 'call ', 'linkStyle '],
  ...['interpolate ', 'default', 'subgraph ', 'subgraph', 'end', 'end\n', 'direction TB'],
  ...['direction LR', 'graph ', 'flowchart ', 'TD', 'LR', 'TB', 'BT', 'RL', '_blank', '_self'],
  ...['accTitle: ', 'accDescr: ', 'accDescr { ', 'fill:#f9f', 'stroke-width:2px', 'shape: rect'],
  ...['label: "x"', '%%', '\t', '\r\n', ' \n', '}\n', 'a()', '()', 'foo'],
  // Preprocess: front matter fences, directives, entities.
  ...['---\n', '%%{', '}%%', '%%{init: {"theme": "dark"}}%%', '%%{init: ', '%%{wrap}%%'],
  ...['#quot;', '#35;', '&amp;', '&#60;', 'ﬂ°', '¶ß', '<br>', '<b>', '="x"'],
  // Shape data and links.
  ...['@{ shape: ', 'icon: "fa:fa-user"', 'img: "https://x/y.png"', '"javascript:alert(1)"'],
  ...['"https://example.com"', 'url(', 'expression(', '\u0000', '‮', '\ud800'],
  ...PAYLOADS,
];
