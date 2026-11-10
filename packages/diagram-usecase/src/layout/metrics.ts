/**
 * The usecase layout's px metrics table (pitfall 13): v12's constants, and the only file in
 * `layout/` that holds a length literal (`packages/conformance/src/usecase-layout-literals.spec.ts`).
 * The values are v12's at fa796a943: the actor shape (`shapes/usecaseActor.ts:21-26`), the use
 * case ovals (`usecaseEllipse.ts:27-28`, `usecaseBusiness.ts:66-74`), the JSON table
 * (`usecaseJsonTable.ts:34-36`), the system boundary (`clusters.js:659-686`) and the paddings
 * v12's `getData` gives each node (`usecaseDb.ts:338-444`). The lengths every graph type shares
 * (label patch, head room, edge wrap, edge spacing, a `[rect]` use case's padding) come from
 * core's px profile instead. Config values (`wrappingWidth`, spacing, fonts) are in `../config.ts`.
 */

export const PX = Object.freeze({
  actor: Object.freeze({
    /** The glyph's box (`ACTOR_FIGURE_WIDTH`, `ACTOR_FIGURE_HEIGHT`). */
    glyphWidth: 56,
    glyphHeight: 72,
    /** Between the glyph and the first label under it (`ACTOR_LABEL_GAP`). */
    labelGap: 8,
    /** Between the stereotype and the name under it (`STEREOTYPE_LABEL_GAP`). */
    stereotypeGap: 2,
    /** Round the glyph and its labels, each side (`getData`'s actor `padding`). */
    pad: 10,
  }),
  ellipse: Object.freeze({
    /**
     * Between the label block and the oval, each side, across and down: twice the shape's
     * `halfPadding`, half of `getData`'s use case `padding` 20 (`rx = w / 2 + 2 · pad`).
     */
    inset: 20,
    /** Between a business oval's stereotype and its label (`labelGap`). */
    stereotypeGap: 2,
  }),
  note: Object.freeze({
    /** Round the label, each side (`getData`'s note `padding`). */
    pad: 10,
  }),
  json: Object.freeze({
    /** Inside each cell, across and down (`CELL_PADDING_X`, `CELL_PADDING_Y`). */
    cellPadX: 8,
    cellPadY: 4,
    /** The outer border (`DEFAULT_BORDER_WIDTH`). */
    border: 1,
    /** Key and value cells wrap here: v12's `insertLabel` took `flowchart.wrappingWidth`'s 200. */
    cellWrap: 200,
  }),
  boundary: Object.freeze({
    /** Between the frame and its content, each side (`getData`'s boundary `padding`). */
    pad: 20,
    /** A package tab is the title plus this high (`labelBBox.height + 10`). */
    tabPad: 10,
    /** A package tab is the title plus this wide (`labelBBox.width + 20`), and at least `tabMin`. */
    tabWidthPad: 20,
    tabMin: 80,
    /** Titles wrap here: v12's `createText` default width. */
    titleWrap: 200,
  }),
  /** Edge labels, `«include»` and `«extend»` among them, are drawn 10px (`styles.ts` `.edgeLabel`). */
  edgeFontSize: 10,
});

/**
 * The text output's cell metrics (D478, spec #517 T7): the shapes' own lengths in character
 * cells. Paddings, spacing, wrap widths and the group frame come from core's cell profile; px
 * config values convert through it (`fromPx`) only when an author set them (as ER's, D124).
 */
export const CELL = Object.freeze({
  /** The actor's three-line figure (` O `, `/|\`, `/ \`), the labels right under it. */
  actor: Object.freeze({ glyphWidth: 3, glyphHeight: 3, labelGap: 0, stereotypeGap: 0, pad: 0 }),
  /** A box side: a use case's, its label rows `( … )` (`[ … ]`), a note's and a table's. */
  side: 1,
});
