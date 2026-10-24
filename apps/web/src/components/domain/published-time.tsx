import { formatPostTime } from '../../lib/format-post-time';
import { formatRelativeTime } from '../../lib/format-relative-time';

/**
 * When a publication was published (Afik 21.10.2026, decision 11.8): the relative time ("לפני 3 שעות"), the exact date and time in the title and
 * in `dateTime`. Display only; the placement comes from `className`.
 */
export function PublishedTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={formatPostTime(iso)} className={className}>
      {formatRelativeTime(iso)}
    </time>
  );
}
