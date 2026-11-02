// globalThis is the back door to every DOM global.
export const doc = (globalThis as { document?: unknown }).document;
