import { checkUserId } from '@nestly/shared';

// The user id an access token names (its `sub` claim), for the two things the web does with the caller's own id: the link it copies
// (F2.4c2 c26) and the check that a link to oneself opens the own profile (c27, DR-O). It is presentation only: the token is NOT
// verified here, and nothing is allowed or hidden because of it. The server verifies the token on every call and decides by it.
export function userIdOfAccessToken(token: string): string | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const base64 = payload.replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const checked = checkUserId(typeof claims === 'object' && claims !== null ? Reflect.get(claims, 'sub') : undefined);
    return checked.ok ? checked.userId : null;
  } catch {
    return null;
  }
}
