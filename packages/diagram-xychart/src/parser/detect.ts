/** v12's XY chart detector, `/^\s*xychart(-beta)?/`: case-sensitive, though the lexer is not. */
export function detectXyChart(text: string): boolean {
  return /^\s*xychart/.test(text);
}
