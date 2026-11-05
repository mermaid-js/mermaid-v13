/** v12's quadrant detector, `/^\s*quadrantChart/`: case-sensitive, though the lexer is not. */
export function detectQuadrant(text: string): boolean {
  return /^\s*quadrantChart/.test(text);
}
