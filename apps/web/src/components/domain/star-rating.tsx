import { cn } from '@/lib/cn';
import { NO_RATING, ratingText, ratingValueText, reviewCountText } from '@/lib/professional-texts';
import { starFills, type StarFill } from '@/lib/rating';

const WIDTH: Readonly<Record<StarFill, string>> = { 0: 'w-0', 0.25: 'w-1/4', 0.5: 'w-1/2', 0.75: 'w-3/4', 1: 'w-full' };

export interface StarRatingProps {
  /** The average, 0-5. */
  rating: number;
  /** What a screen reader hears instead of the stars ("דירוג 4.3 מתוך 5 · 3 ביקורות"). */
  label: string;
  size?: 'md' | 'lg';
  /** Placement only. */
  className?: string;
}

// Five stars filled in quarters (§11.22): an outline star with its filled copy clipped to the quarter over it, from the reading direction's
// start. Display only; the stars are hidden from assistive technology and the label says the number. The fill is never the only signal:
// the screens show the number beside it.
export function StarRating({ rating, label, size = 'md', className }: StarRatingProps) {
  return (
    <span role="img" aria-label={label} className={cn('inline-flex items-center gap-0.5 leading-none', size === 'lg' ? 'text-h2' : 'text-body', className)}>
      {starFills(rating).map((fill, star) => (
        <span key={star} aria-hidden="true" className="relative inline-block">
          <span className="text-muted-foreground">☆</span>
          <span className={cn('absolute inset-y-0 start-0 overflow-hidden whitespace-nowrap text-primary-strong', WIDTH[fill])}>★</span>
        </span>
      ))}
    </span>
  );
}

/** A card's rating line (Directory, Following): the stars with "4.3 · 3 ביקורות" beside them, or "עוד אין ביקורות". */
export function RatingLine({ rating, count, className }: { rating: number | null; count: number; className?: string }) {
  if (rating === null) return <p className={cn('text-small text-muted-foreground', className)}>{NO_RATING}</p>;
  return (
    <p className={cn('flex flex-wrap items-center gap-2 text-small', className)}>
      <StarRating rating={rating} label={ratingText(rating, count)} />
      <span aria-hidden="true" className="tabular-nums">
        {ratingValueText(rating)} · {reviewCountText(count)}
      </span>
    </p>
  );
}
