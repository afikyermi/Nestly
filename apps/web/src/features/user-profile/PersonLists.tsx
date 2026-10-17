import { useId } from 'react';
import { Link } from 'react-router';
import type { ProfileFriendEntry } from '@nestly/shared';
import { Avatar } from '@/components/ui/avatar';
import { userProfilePath } from '@/lib/profile-link';
import { friendsOfTitle, FRIENDS_EMPTY_TEXT, MUTUAL_EMPTY_TEXT, MUTUAL_TITLE } from './user-profile-texts';

interface ListProps {
  title: string;
  emptyText: string;
  entries: ProfileFriendEntry[];
  testId: string;
}

// One list of people on a profile (§1.4: "החברים של <name>", "חברים משותפים"): each entry links to that person's profile, the link
// named by the person's name. An empty list says why (Q1). Display only.
function PersonList({ title, emptyText, entries, testId }: ListProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <h2 id={id} className="text-h3">
        {title}
      </h2>
      <div className="mt-3 rounded-lg bg-card p-4 shadow-card md:p-5">
        {entries.length === 0 ? (
          <p className="text-body text-muted-foreground">{emptyText}</p>
        ) : (
          <ul aria-labelledby={id} className="flex flex-col gap-1">
            {entries.map((entry) => (
              <li key={entry.userId}>
                <Link
                  to={userProfilePath(entry.userId)}
                  className="inline-flex min-h-11 w-full items-center gap-3 rounded-sm text-body text-card-foreground no-underline hover:text-primary-strong"
                >
                  <Avatar name={entry.fullName} decorative />
                  <span className="min-w-0 flex-1 wrap-anywhere">
                    <bdi dir="auto">{entry.fullName}</bdi>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export interface PersonListsProps {
  /** The profile's owner: the first list is named for them. */
  name: string;
  friends: ProfileFriendEntry[];
  mutualFriends: ProfileFriendEntry[];
}

/** The two lists of a profile (c25): the person's Friends, then the Friends the viewer and the person share. */
export function PersonLists({ name, friends, mutualFriends }: PersonListsProps) {
  return (
    <>
      <PersonList title={friendsOfTitle(name)} emptyText={FRIENDS_EMPTY_TEXT} entries={friends} testId="user-profile-friends" />
      <PersonList title={MUTUAL_TITLE} emptyText={MUTUAL_EMPTY_TEXT} entries={mutualFriends} testId="user-profile-mutual" />
    </>
  );
}
