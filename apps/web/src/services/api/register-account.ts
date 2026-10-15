import type { RegistrationRequestInput, RegistrationStep1 } from '@nestly/shared';

// The one call to our server in registration (F1.4): POST /api/register with the session Auth just issued. The body is step 1
// and the consent declaration, never the email or the password (criterion 13). Only the status is read: no response text
// reaches the screen.
export type RegisterOutcome =
  | 'created'
  | 'already_registered' // 409
  | 'unauthenticated' // 401
  | 'unavailable' // 503, or the call did not reach the server: worth trying again
  | 'failed'; // anything else, including the server's 500: a retry would fail the same way

function dateParts(iso: string): { day: string; month: string; year: string } {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { day, month, year };
}

const NO_DATE = { day: '', month: '', year: '' };

/** The parsed step 1 as the request body: the shape the server's strict schema accepts. */
export function toRegisterBody(step1: RegistrationStep1): RegistrationRequestInput {
  return {
    stages: step1.stages,
    fullName: step1.fullName,
    ...(step1.parentGender !== null ? { parentGender: step1.parentGender } : {}),
    dueDate: step1.dueDate === null ? NO_DATE : dateParts(step1.dueDate),
    children: step1.children.map((child) => ({ name: child.name, sex: child.sex, birthDate: dateParts(child.birthDate) })),
    consent: true,
  };
}

export async function registerAccount(accessToken: string, step1: RegistrationStep1): Promise<RegisterOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/register', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(toRegisterBody(step1)),
    });
  } catch {
    return 'unavailable';
  }
  if (response.status === 201) return 'created';
  if (response.status === 409) return 'already_registered';
  if (response.status === 401) return 'unauthenticated';
  if (response.status === 503) return 'unavailable';
  return 'failed';
}
