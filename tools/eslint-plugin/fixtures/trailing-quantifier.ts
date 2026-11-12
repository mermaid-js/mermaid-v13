// An unbounded quantifier before `$`, with nothing before it to pin the start, is retried from every position of
// a run which does not end the text: quadratic (R-PARSE-7, #699).
export const semicolons = /;+$/;
export const blanks = new RegExp('\\s*$', 'gm');
export const either = /^"+|"+$/g;
export const grouped = /(?:;+|,)$/;
export const optional = /,?[\t ]*$/;
