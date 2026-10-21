import { groupPathParams } from '@nestly/shared';

// The address of a Group's page (I10, PG-034): `/groups/<group id>` and nothing else in it. Opening it always asks the server again (a Group
// that is gone, or a Private Group's content, is the server's answer).
export const GROUP_PATTERN = '/groups/:groupId';

export const groupPath = (groupId: string): string => `/groups/${groupId}`;

/** The Group id of a `/groups/<id>` path (any trailing slash already removed), else null: only a uuid counts. */
export function groupIdOfPath(path: string): string | null {
  const match = /^\/groups\/([^/]+)$/.exec(path);
  const parsed = groupPathParams.safeParse({ id: match?.[1] });
  return parsed.success ? parsed.data.id.toLowerCase() : null;
}
