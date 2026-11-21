/**
 * Class members as v12's `ClassMember` (`classTypes.ts`) read them: visibility, name,
 * parameters, return type and classifier, and the display text its renderer drew. v12 used a
 * backtracking regex for methods; this is a linear scan with the same result (R-PARSE-7).
 */
import { isLineEnd } from '@mermaid-js/core/parser-kit';
import {
  LITERAL,
  parseGenericTypes,
  REFERENCES,
  type Brackets,
} from '@mermaid-js/shared/parser/generic-types';

export { parseGenericTypes };

export type Visibility = '' | '#' | '+' | '~' | '-';
/** `$` static (underlined), `*` abstract (italic), `''` none. */
export type Classifier = '' | '$' | '*';

/** The parts of one member line, as v12 parsed them. */
export interface MemberParts {
  kind: 'attribute' | 'method';
  visibility: Visibility;
  /** The member's name; for an attribute, its whole text less visibility and classifier. */
  name: string;
  /** A method's parameters as written between the parentheses (trimmed); `''` otherwise. */
  parameters: string;
  /** A method's return type (trimmed); `''` otherwise. */
  returnType: string;
  classifier: Classifier;
}

const isVisibility = (c: string): c is Exclude<Visibility, ''> =>
  c === '#' || c === '+' || c === '~' || c === '-';
const isClassifier = (c: string): c is Exclude<Classifier, ''> => c === '$' || c === '*';
/** JS regex `\s`: blanks and line ends. */
const isJsSpace = (c: string): boolean => c !== '' && c.trim() === '';
const lineEndAt = (text: string, i: number): boolean => isLineEnd(text.charCodeAt(i));

/** v12 kept one leading blank of a name and trimmed the rest. */
const tidyName = (name: string): string => (name.startsWith(' ') ? ' ' + name.trim() : name.trim());

/**
 * A method as v12's `/([#+~-])?(.+)\((.*)\)([\s$*])?(.*)([$*])?/` matched it, or undefined
 * when that regex finds no match (v12 then failed on the member).
 */
export function method(text: string): MemberParts | undefined {
  // `.` stops at line ends, so the match lies in one line: the first line with a `(` after
  // its first character and a `)` after that. `(.+)` and `(.*)` are greedy: the last `)` of
  // the line, and the last `(` before it.
  for (let a = 0; a <= text.length; ) {
    let b = a;
    while (b < text.length && !lineEndAt(text, b)) b++;
    const close = b > a ? text.lastIndexOf(')', b - 1) : -1;
    const open = close > a ? text.lastIndexOf('(', close - 1) : -1;
    if (close >= a && open >= a + 1) {
      const first = text[a] ?? '';
      const vis = isVisibility(first) && open >= a + 2 ? first : '';
      // `([\s$*])?` takes one blank, `$` or `*` after the `)` (a line end is a blank too),
      // then `(.*)` runs to the next line end; `([$*])?` is always empty after it.
      let r = close + 1;
      let mark = '';
      const next = text[r] ?? '';
      if (isJsSpace(next) || isClassifier(next)) {
        mark = next.trim();
        r++;
      }
      let e = r;
      while (e < text.length && !lineEndAt(text, e)) e++;
      let returnType = text.slice(r, e).trim();
      let classifier: Classifier = isClassifier(mark) ? mark : '';
      if (classifier === '') {
        const last = returnType.slice(-1);
        if (isClassifier(last)) {
          classifier = last;
          returnType = returnType.slice(0, -1);
        }
      }
      return {
        kind: 'method',
        visibility: vis,
        name: tidyName(text.slice(vis ? a + 1 : a, open)),
        parameters: text.slice(open + 1, close).trim(),
        returnType,
        classifier,
      };
    }
    a = b + 1;
  }
  return undefined;
}

export function attribute(text: string): MemberParts {
  const first = text.slice(0, 1);
  const last = text.slice(-1);
  const visibility: Visibility = isVisibility(first) ? first : '';
  const classifier: Classifier = isClassifier(last) ? last : '';
  const name = text.slice(visibility ? 1 : 0, classifier ? text.length - 1 : text.length);
  return {
    kind: 'attribute',
    visibility,
    name: tidyName(name),
    parameters: '',
    returnType: '',
    classifier,
  };
}

/** What one member line is (v12 `addMember`). */
export type MemberLine =
  | { annotation: string }
  | { member: MemberParts }
  /** A method v12 could not read: it threw on it. */
  | { invalid: true }
  /** An empty line: nothing. */
  | undefined;

/**
 * One member line, trimmed as v12 did: an annotation (`<<name>>`), a method (a `)` after the
 * first character) or an attribute.
 */
export function readMember(line: string): MemberLine {
  const text = line.trim();
  if (text.startsWith('<<') && text.endsWith('>>')) {
    return { annotation: text.substring(2, text.length - 2) };
  }
  if (text.indexOf(')') > 0) {
    const m = method(text);
    return m ? { member: m } : { invalid: true };
  }
  return text ? { member: attribute(text) } : undefined;
}

/** The CSS v12 gave each classifier (`parseClassifier`). */
const CLASSIFIER_CSS: Readonly<Record<Classifier, string>> = {
  '': '',
  '*': 'font-style:italic;',
  $: 'text-decoration:underline;',
};

/** A member's text with each generic's `~ … ~` as `brackets`. */
function shown(m: MemberParts, brackets: Brackets): string {
  let text = m.visibility + parseGenericTypes(m.name, brackets);
  if (m.kind === 'method') {
    text += `(${parseGenericTypes(m.parameters.trim(), brackets)})`;
    if (m.returnType) text += ' : ' + parseGenericTypes(m.returnType, brackets);
  }
  return text.trim();
}

/** The text v12's renderer drew for a member, and the CSS of its classifier (`getDisplayDetails`). */
export function memberDisplay(m: MemberParts): { displayText: string; cssStyle: string } {
  return { displayText: shown(m, LITERAL), cssStyle: CLASSIFIER_CSS[m.classifier] };
}

/**
 * A member row's text as the label layout reads it: {@link memberDisplay}'s text with the
 * brackets of each generic as `&lt;` and `&gt;`, as v12 wrote them (`ClassMember.text`), so
 * `+List~Data~ items` draws `+List<Data> items` (D619). Unlike v12, a tag the author typed
 * (`<br>`, `<b>`) is still read as markup (D564).
 */
export const memberLabel = (m: MemberParts): string => shown(m, REFERENCES);

/**
 * v12 `ClassMember.text`: the member's text with `<` and `>` escaped, visibility first
 * (backslash-escaped, a leading `\&lt;` read back as `~`). Kept for parity checks and for
 * renderers that need v12's exact string.
 */
export function memberText(m: MemberParts): string {
  const sig =
    m.kind === 'method'
      ? `(${parseGenericTypes(m.parameters)})${m.returnType ? ' : ' + parseGenericTypes(m.returnType) : ''}`
      : '';
  let text = `${m.visibility ? '\\' + m.visibility : ''}${parseGenericTypes(m.name)}${sig}`
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  if (text.startsWith('\\&lt;')) text = text.replace('\\&lt;', '~');
  return text;
}
