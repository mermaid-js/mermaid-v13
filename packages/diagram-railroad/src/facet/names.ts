// cspell:words rulename
/**
 * Railroad rule names (D513, D517): what `isValidId` accepts as a `rule` name. The facet serves
 * four notations and `isValidId` is not told which one a document is in, so it refuses here
 * what no notation reads as one name: an empty name, one that is not a name in any notation's
 * lexer (`[A-Z_a-z][\w-]*`, ABNF's `[A-Za-z][A-Za-z0-9-]*` being a part of it), and a name that
 * starts with `title`, which every notation reads as a `title` line and the rest (D513). What
 * only one notation refuses (an ABNF name with `_`, an IR keyword such as `choice`) is refused
 * by the service's read-back check: the renamed text no longer parses to the same rules. An
 * existing name is the service's clash check.
 */

/** A name in the IR, EBNF and PEG lexers (`ID`); ABNF's `rulename` is a part of it. */
const NAME = /^[A-Z_a-z][\w-]*$/;

/** Why `name` cannot be a rule name, if it cannot. */
export function nameReason(name: string): string | undefined {
  if (name === '') return 'A rule name cannot be empty.';
  if (!NAME.test(name)) {
    return `\`${name}\` is not a rule name: a name is a letter or \`_\`, then letters, digits, \`_\` and \`-\` (in ABNF no \`_\`).`;
  }
  if (name.startsWith('title')) {
    return `\`${name}\` starts with \`title\`, which every notation reads as a \`title\` line, so it cannot name a rule.`;
  }
  return undefined;
}
