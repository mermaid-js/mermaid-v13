export function scan(text: string, p: number): number {
  const c = text.charCodeAt(p);
  if (c === 123) return 1;
  if (text.codePointAt(p) === 0x7d) return 2;
  switch (c) {
    case 40:
      return 3;
  }
  return 0;
}
