// The wording of the three recovery questions (F1.6, DR-A; gender-neutral plural). The server knows ids only; the hint of a
// question is part of its text, so a label carries it.
import type { RecoveryQuestionId } from './recovery.js';

export const RECOVERY_QUESTION_TEXTS: Readonly<Record<RecoveryQuestionId, string>> = {
  pet: 'איך קראו לחיית המחמד הראשונה שלכם? (אם לא הייתה, כתבו שם של בובה או חפץ אהוב)',
  nickname: 'באיזה שם כינו אתכם בילדות?',
  street: 'איך קראו לרחוב שבו גדלתם? (בלי המילה רחוב)',
};
