import type { PublishedAnnouncement } from '@nestly/shared';
import { PublishedTime } from '@/components/domain/published-time';
import { SYSTEM_NOTICES_LABEL } from './feed-texts';

// The published System Announcements at the top of the feed (FR-ADMIN-008): official text from the Nestly team, newest first. Read only: no
// control, so the keyboard order of the feed is unchanged. Nothing shows when there is none.
export function SystemNotices({ notices }: { notices: readonly PublishedAnnouncement[] }) {
  if (notices.length === 0) return null;
  return (
    <section aria-label={SYSTEM_NOTICES_LABEL} className="mt-3 flex flex-col gap-2">
      {notices.map((notice) => (
        <article key={notice.id} className="rounded-lg border border-border bg-primary-soft p-4">
          <h2 className="text-label" dir="auto">
            {notice.title}
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-body" dir="auto">
            {notice.body}
          </p>
          {/* Afik 21.10.2026 (decision 11.8): every publication shows its relative time */}
          <PublishedTime iso={notice.publishedAt} className="mt-1 block text-small text-muted-foreground" />
        </article>
      ))}
    </section>
  );
}
