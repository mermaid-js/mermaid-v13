// Single-level quantifiers and fixed repetition inside a group stay linear.
export const id = /^[A-Za-z_][\w-]*/y;
export const pairs = /(?:ab)+/;
export const hex = /^#(?:[0-9a-f]{3}){1,2}$/i;
// A quantifier before `$` is linear when the match can start in one place only: after `^`,
// after a required character, at `lastIndex` (sticky), or when the quantifier is bounded.
export const whole = /^\s*\w+;*$/;
export const sticky = /;+$/y;
export const bounded = /;{1,3}$/;
export const lines = /^[\t ]+$/gm;
export const literal = /end$/;
export const opener = /\{\s*$/;
export const call = /(?:^|\s)call[\t ]+$/;
export const lineStart = /(?:^|[\r\n])[\t ]*$/;
