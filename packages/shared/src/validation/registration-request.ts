// The body of POST /api/register (F1.4 criteria 2, 3): step 1 plus the consent declaration, and nothing else. No
// email, password, consent version or parent birth date: the strict schema refuses any unknown key at any level.
import { z } from 'zod';
import { registrationConsentInput } from './registration-credentials.js';
import { createRegistrationStep1Schema, registrationStep1Input, type RegistrationStep1Input } from './registration-step1.js';

/** The body as received. Raw bounds and unknown-key checks live here, before any splitting of text. */
export const registrationRequestInput = registrationStep1Input.extend({ consent: registrationConsentInput });
export type RegistrationRequestInput = z.input<typeof registrationRequestInput>;

/**
 * The body judged against `today` (YYYY-MM-DD; `earliestToday` anchors the due date's lower bound, createRegistrationStep1Schema). The output is the clean step 1: the consent declaration has done its
 * work once it passed, and the consent record's versions come from the server's constants, never from the body.
 */
export function createRegistrationRequestSchema(today: string, earliestToday: string = today) {
  return registrationRequestInput
    .transform((body): RegistrationStep1Input => {
      const step1: RegistrationStep1Input = {
        stages: body.stages,
        fullName: body.fullName,
        dueDate: body.dueDate,
        children: body.children,
      };
      if (body.parentGender !== undefined) step1.parentGender = body.parentGender;
      return step1;
    })
    .pipe(createRegistrationStep1Schema(today, earliestToday));
}
