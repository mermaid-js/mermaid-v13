// A date from a value is not a clock read (D270).
export const epoch = new Date(0);
export const parsed = new Date('2026-11-06');
export const at = (ms: number) => new Date(ms).getTime();
