const LBRACE = 0x7b;

export function scan(text: string, p: number, n: number): number {
  const c = text.charCodeAt(p);
  if (c === LBRACE) return 1;
  let i = 0;
  if (n === 3 || i++ > 2) return 2;
  return text.length > 80 ? 3 : 0;
}
