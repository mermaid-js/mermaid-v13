// Nested quantifiers backtrack exponentially on hostile input (R-PARSE-7).
export const trailing = /(a+)+$/;
export const words = new RegExp('^(?:\\s*\\w+)*;');
