/**
 * The quadrant grammar's lexer input (see the header of `grammar/quadrant.ebnf`): the text mermaid
 * 12 handed its quadrant lexer, built with v12's own regexes (`preprocess.ts` `cleanupText`,
 * front matter, `directiveRegex`, `cleanupComments`, `encodeEntities`) and mapped back to
 * source offsets. Dev and CI only: an independent reference for the lexer's own source view
 * (`src/parser/v12-text.ts`). It is class's input (`../../class/grammar/lexer-input.ts`):
 * v12's preprocessing is the same for every jison type.
 */
import { appendMapped, mapped, replaceMapped, sliceMapped } from '@mermaid-js/gen-grammar';
import type { MappedText } from '@mermaid-js/gen-grammar';

// v12 `diagram-api/regexes.ts`, byte for byte.
const FRONT_MATTER = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
// eslint-disable-next-line mermaid/no-nested-quantifier -- v12's regex byte for byte (dev-only reference)
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;

export function quadrantLexerInput(src: string): MappedText {
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
  return appendMapped(m, '\n', src.length);
}
