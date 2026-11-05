/** The eager detector of the fixture diagram: a source whose first word is `fixturebox`. */
export function detector(text) {
  return /^\s*fixturebox\b/.test(text);
}
