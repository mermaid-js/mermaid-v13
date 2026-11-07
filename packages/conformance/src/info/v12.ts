/**
 * The v12 side of info parity. mermaid\@12's info DB held one field, the version
 * (`getVersion()`), which is the build's, not the source's: nothing parsed reached it. So the
 * snapshot is empty, and info parity is accept/reject parity.
 */

/** `diagram.type` values mermaid\@12 reports for info sources. */
export const INFO_V12_TYPES = ['info'];

/** What both sides compare: nothing a source can change. */
export type InfoSnapshot = Record<string, never>;

export function infoV12Snapshot(_db: unknown): InfoSnapshot {
  return {};
}
