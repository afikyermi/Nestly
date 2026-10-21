import { useId } from "react";
import { Link } from "react-router";
import type { SearchResponse, SearchType } from "@nestly/shared";
import { Avatar } from "@/components/ui/avatar";
import { formatPostTime } from "@/lib/format-post-time";
import { postPath } from "@/lib/post-link";
import { userProfilePath } from "@/lib/profile-link";
import { groupPath } from "@/lib/group-link";
import {
  ANONYMOUS_AUTHOR,
  GROUPS_NONE_TEXT,
  GROUPS_TITLE,
  GROUP_PRIVACY_LABEL,
  LIMITED_TEXT,
  PEOPLE_NONE_TEXT,
  PEOPLE_TITLE,
  personLink,
  POSTS_NONE_TEXT,
  POSTS_TITLE,
} from "./search-texts";

export interface SearchResultsProps {
  data: SearchResponse;
  /** Which kinds to show: all three sections, or one. */
  type: SearchType;
  /** The dropdown shows the first few of each; the results screen all. */
  limit?: number | undefined;
  /** A result was chosen (the dropdown closes). */
  onChoose?: (() => void) | undefined;
}

// The results of one search in sections (FR-SEARCH-001, AC-039): People, Groups, Posts, each with its own empty line, so a section is
// never missing. Display only. The people limit is said once, where People would be.
export function SearchResults({
  data,
  type,
  limit,
  onChoose,
}: SearchResultsProps) {
  const base = useId();
  const take = <T,>(items: readonly T[]): readonly T[] =>
    limit === undefined ? items : items.slice(0, limit);
  const show = (kind: SearchType) => type === "all" || type === kind;
  return (
    <div className="flex flex-col gap-4">
      {show("people") ? (
        <section aria-labelledby={`${base}-people`}>
          <h2
            id={`${base}-people`}
            className="text-label text-muted-foreground"
          >
            {PEOPLE_TITLE}
          </h2>
          {data.peopleLimited ? (
            <p role="status" className="py-2 text-small">
              {LIMITED_TEXT}
            </p>
          ) : data.people.length === 0 ? (
            <p className="py-2 text-small text-muted-foreground">
              {PEOPLE_NONE_TEXT}
            </p>
          ) : (
            <ul>
              {take(data.people).map((person) => (
                <li key={person.userId}>
                  <Link
                    to={userProfilePath(person.userId)}
                    onClick={onChoose}
                    aria-label={personLink(person.fullName)}
                    className="flex min-h-12 items-center gap-3 rounded-md px-2 text-foreground no-underline hover:bg-muted"
                  >
                    <Avatar name={person.fullName} decorative />
                    <span className="text-body">{person.fullName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {show("groups") ? (
        <section aria-labelledby={`${base}-groups`}>
          <h2
            id={`${base}-groups`}
            className="text-label text-muted-foreground"
          >
            {GROUPS_TITLE}
          </h2>
          {data.groups.length === 0 ? (
            <p className="py-2 text-small text-muted-foreground">
              {GROUPS_NONE_TEXT}
            </p>
          ) : (
            <ul>
              {take(data.groups).map((group) => (
                <li key={group.id}>
                  <Link
                    to={groupPath(group.id)}
                    onClick={onChoose}
                    className="flex min-h-12 flex-col justify-center rounded-md px-2 py-1 text-foreground no-underline hover:bg-muted"
                  >
                    <span className="text-body">{group.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {GROUP_PRIVACY_LABEL[group.privacy]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {show("posts") ? (
        <section aria-labelledby={`${base}-posts`}>
          <h2 id={`${base}-posts`} className="text-label text-muted-foreground">
            {POSTS_TITLE}
          </h2>
          {data.posts.length === 0 ? (
            <p className="py-2 text-small text-muted-foreground">
              {POSTS_NONE_TEXT}
            </p>
          ) : (
            <ul>
              {take(data.posts).map((post) => (
                <li key={post.id}>
                  <Link
                    to={postPath(post.id)}
                    onClick={onChoose}
                    className="flex min-h-12 flex-col justify-center rounded-md px-2 py-1 text-foreground no-underline hover:bg-muted"
                  >
                    <span className="text-body">{post.snippet}</span>
                    <span className="text-caption text-muted-foreground">
                      {post.authorName ?? ANONYMOUS_AUTHOR} ·{" "}
                      {formatPostTime(post.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
