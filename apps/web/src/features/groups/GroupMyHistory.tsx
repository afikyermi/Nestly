import { useEffect, useId, useState } from 'react';
import type { GroupEnforcementRecord } from '@nestly/shared';
import { formatPostTime } from '@/lib/format-post-time';
import { listMyEnforcements } from '@/services/api/groups';
import { HISTORY_KIND, MY_HISTORY_TITLE, muteUntilLine, REASON_LABEL } from './groups-texts';
import { useGroupsCall } from './use-groups-call';

// The caller's own enforcement history in one Group (FR-GRP-003, §13 GroupMemberEnforcement, OP-070): a warning and mute — also after it
// ended — a removal and block, its lifting; the reason and the dates, never which manager acted. Shown in "about" to a member and to one
// who was removed, only when there is something to show (most members have none). The server returns only the records about the caller.
export function GroupMyHistory({ groupId }: { groupId: string }) {
  const call = useGroupsCall();
  const id = useId();
  const [records, setRecords] = useState<GroupEnforcementRecord[]>([]);

  useEffect(() => {
    let live = true;
    void call((token) => listMyEnforcements(token, groupId)).then((result) => {
      if (live && result.kind === 'ok') setRecords(result.value);
    });
    return () => {
      live = false;
    };
  }, [call, groupId]);

  if (records.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-card">
      <h2 id={id} className="text-h3">
        {MY_HISTORY_TITLE}
      </h2>
      <ul className="flex flex-col gap-2">
        {records.map((r) => (
          <li key={r.id} className="flex flex-col">
            <span className="text-body">{HISTORY_KIND[r.kind]}</span>
            <span className="text-small text-muted-foreground">
              {[
                r.reason === null ? null : r.reason === 'other' && r.reasonText !== null ? r.reasonText : REASON_LABEL[r.reason],
                r.muteUntil === null ? null : muteUntilLine(formatPostTime(r.muteUntil)),
                formatPostTime(r.createdAt),
              ]
                .filter((x) => x !== null)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
