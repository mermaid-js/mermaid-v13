/** Keys only the integrator sets (R-SEC-5, R-SEC-6). */

/**
 * Keys diagram text can never set, whatever `secure` says (R-SEC-5, R-SEC-6, DESIGN §9):
 * v12's default `secure` list plus v13's integrator options. Some of these are render
 * options rather than schema keys; they are listed so diagram text naming them is
 * reported as a secure-key attempt rather than an unknown key.
 */
export const INTEGRATOR_ONLY_KEYS: readonly string[] = Object.freeze([
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'maxEdges',
  'suppressErrorRendering',
  'limits',
  'measurer',
  'deterministic',
  'idPrefix',
  'output',
  'linkSchemes',
  'discovery',
  'cdnBase',
]);
