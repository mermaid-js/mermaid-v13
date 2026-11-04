// The participant kind → text-form table (D82). Every participant is a box; the table picks its
// corners and sides. Kinds not listed are drawn as plain boxes and named in one `ASCII_SHAPE`
// warning.
import type { BoxOptions } from '@mermaid-js/core/ascii';
import type { ParticipantKind } from '../model.ts';

const FORMS: Readonly<Partial<Record<ParticipantKind, BoxOptions>>> = {
  participant: {},
  actor: { form: 'rounded' },
  database: { form: 'caps' },
};

/** The box options a participant kind is drawn with, or undefined when it has no text form. */
export function symbolForm(kind: ParticipantKind): BoxOptions | undefined {
  return FORMS[kind];
}
