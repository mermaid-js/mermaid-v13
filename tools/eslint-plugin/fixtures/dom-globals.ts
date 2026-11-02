// Reaches for browser globals; core and diagram packages must stay DOM-free (R-ARCH-1).
export const width = window.innerWidth;
export const node = document.createElement('div');
export const isElement = (value: unknown) => value instanceof HTMLElement;
