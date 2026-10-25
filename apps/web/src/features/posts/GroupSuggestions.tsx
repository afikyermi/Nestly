import { useId } from 'react';
import { Link } from 'react-router';
import type { FeedGroupSuggestion } from '@nestly/shared';
import { groupPath } from '@/lib/group-link';
import { ACTIVE_GROUPS_TITLE, activeGroupMembers } from './posts-texts';

// I10-C (§11.14; FR-FEED-001, FR-ALG-010): active Public Groups the viewer is not a member of, at the top of the first page of the feed. A
// unit of Groups (name, description, member count), never their posts; a quiet Group is never suggested and nothing here is paid.
export function GroupSuggestions({ groups }: { groups: readonly FeedGroupSuggestion[] }) {
  const titleId = useId();
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="mt-3 flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
      <h3 id={titleId} className="text-label">
        {ACTIVE_GROUPS_TITLE}
      </h3>
      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <li key={group.id} className="flex flex-col gap-0.5">
            <Link to={groupPath(group.id)} className="text-body font-semibold text-primary-strong underline underline-offset-4">
              {group.name}
            </Link>
            {group.description !== null ? <p className="line-clamp-2 text-small text-muted-foreground">{group.description}</p> : null}
            <span className="text-small text-muted-foreground">{activeGroupMembers(group.memberCount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
