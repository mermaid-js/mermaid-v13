// Single-level quantifiers and fixed repetition inside a group stay linear.
export const id = /^[A-Za-z_][\w-]*/y;
export const pairs = /(?:ab)+/;
export const hex = /^#(?:[0-9a-f]{3}){1,2}$/i;
