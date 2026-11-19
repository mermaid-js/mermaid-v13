// Constants, and state that lives inside a call, are fine.
declare let ambient: number;
export const table = new Map<string, number>();

for (let i = 0; i < 3; i++) table.set(String(i), i);

export function counter(): () => number {
  let n = ambient;
  return () => n++;
}
