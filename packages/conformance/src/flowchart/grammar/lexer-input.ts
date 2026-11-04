/**
 * The flowchart grammar's lexer input (see the header of `grammar/flowchart.ebnf`): the text
 * mermaid@12 handed its flowchart lexer, built with v12's own regexes (`preprocess.ts`
 * `cleanupText`, front matter, `directiveRegex`, `cleanupComments`, `encodeEntities`,
 * `flowParser.ts`) and mapped back to source offsets. Dev and CI only; the hand-written
 * parser reproduces these effects without rewriting (the parser kit's source view, D114), so
 * this is an independent reference for it.
 */
import { appendMapped, mapped, replaceMapped, sliceMapped } from '@mermaid-js/gen-grammar';
import type { MappedText } from '@mermaid-js/gen-grammar';

// v12 `diagram-api/regexes.ts`, byte for byte.
const FRONT_MATTER = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
// eslint-disable-next-line mermaid/no-nested-quantifier -- v12's regex byte for byte (dev-only reference)
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;

export function flowchartLexerInput(src: string): MappedText {
  let m = mapped(src);
  m = replaceMapped(m, /\r\n?/g, () => '\n');
  m = replaceMapped(
    m,
    /<(\w+)([^>]*)>/g,
    (_, tag = '', attrs = '') => '<' + tag + attrs.replace(/="([^"]*)"/g, "='$1'") + '>'
  );
  const fm = FRONT_MATTER.exec(m.text);
  if (fm) m = sliceMapped(m, fm[0].length);
  m = replaceMapped(m, DIRECTIVE, () => '');
  m = replaceMapped(m, /^\s*%%(?!{)[^\n]+\n?/gm, () => '');
  m = sliceMapped(m, m.text.length - m.text.trimStart().length);
  m = replaceMapped(m, /style.*:\S*#.*;/g, (s) => s.slice(0, -1));
  m = replaceMapped(m, /classDef.*:\S*#.*;/g, (s) => s.slice(0, -1));
  m = replaceMapped(m, /#\w+;/g, (s) => {
    const inner = s.slice(1, -1);
    return /^\+?\d+$/.test(inner) ? `ﬂ°°${inner}¶ß` : `ﬂ°${inner}¶ß`;
  });
  m = appendMapped(m, '\n', src.length);
  return replaceMapped(m, /}\s*\n/g, () => '}\n');
}
