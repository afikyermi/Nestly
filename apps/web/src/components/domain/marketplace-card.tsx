import type { ReactNode } from 'react';
import type { MediaImage } from '@nestly/shared';
import { MediaTile } from '@/components/shared/media-tile';
import { cn } from '@/lib/cn';
import { FREE_TEXT, SPONSORED_BADGE } from '@/lib/marketplace-texts';
import { PROMOTED_LISTING_LABEL } from '@/lib/promotion-texts';

export interface MarketplaceCardProps {
  /** `listing`: a user's own item (organic); `sponsored`: a company's product, always marked (BR-005, AC-008, AC-020). */
  variant: 'listing' | 'sponsored';
  /** `tile`: the image on top, square, in a two-column grid (the Marketplace results); `row` (default): the image beside the text (lists). */
  layout?: 'tile' | 'row';
  /** The title, already a link or a heading: the Page decides where it goes. */
  title: ReactNode;
  image: MediaImage | null;
  imageAlt: string;
  /** The price line ("₪450", "למסירה"); none for a sponsored product. */
  price?: string;
  /** One line under the title: condition · city · seller, or the sponsor. */
  meta: string;
  /** Short marks: "ממומן" (always on a sponsored card), "נמכר/נמסר", "פגה". */
  badges?: readonly string[];
  /** Below the text: the sponsor's link or an owner's actions. */
  footer?: ReactNode;
  /** Placement only. */
  className?: string;
}

// A mark is information, never a control (22 high, corners 6): "ממומן" dark, "מודעה מקודמת" sand, the rest neutral.
function badgeStyle(badge: string): string {
  if (badge === SPONSORED_BADGE) return 'bg-foreground text-background';
  if (badge === PROMOTED_LISTING_LABEL) return 'bg-warm text-warm-foreground';
  return 'border border-border bg-card text-foreground';
}

function Badges({ badges, className }: { badges: readonly string[]; className?: string }) {
  if (badges.length === 0) return null;
  return (
    <p className={cn('flex flex-wrap gap-1', className)}>
      {badges.map((badge) => (
        <span key={badge} className={cn('inline-flex h-5.5 items-center rounded-sm px-2 text-caption font-bold', badgeStyle(badge))}>
          {badge}
        </span>
      ))}
    </p>
  );
}

// The Marketplace item card (SRS §4.1 "כרטיס פריט Marketplace"): one component for a user's listing and a sponsored product, the variant marking
// the source (FR-MKT-003). A sponsored card carries its dark "ממומן" mark first, and the screen shows it apart, so it is never read as a user's
// listing. As a tile: a square image (corners 14) with the marks in its corner, then the price, a two-line title and the details line; the price
// is shown above the title but read after it (the order classes move it, not the DOM). Display only.
export function MarketplaceCard({ variant, layout = 'row', title, image, imageAlt, price, meta, badges = [], footer, className }: MarketplaceCardProps) {
  const sponsored = variant === 'sponsored';
  const promoted = badges.includes(PROMOTED_LISTING_LABEL);
  const priceClass = cn('text-h3 tabular-nums', price === FREE_TEXT && 'text-primary-strong');

  if (layout === 'tile') {
    return (
      <article className={cn('flex flex-col gap-2', className)}>
        <div className={cn('relative aspect-square w-full overflow-hidden rounded-lg bg-muted', promoted && 'ring-2 ring-warm-foreground/40')}>
          {image === null ? null : <MediaTile image={image} alt={imageAlt} className="size-full rounded-none" />}
          <Badges badges={badges} className="absolute end-2 top-2" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="order-2 line-clamp-2 text-body font-semibold wrap-anywhere">{title}</div>
          {price === undefined ? null : <p className={cn('order-1', priceClass)}>{price}</p>}
          <p className="order-3 text-caption text-muted-foreground">{meta}</p>
          {footer === undefined ? null : <div className="order-4">{footer}</div>}
        </div>
      </article>
    );
  }

  return (
    <article className={cn('flex gap-3 rounded-lg bg-card p-3 shadow-card', className)}>
      <div className={cn('shrink-0 overflow-hidden rounded-md bg-muted', sponsored ? 'size-16' : 'size-24')}>
        {image === null ? null : <MediaTile image={image} alt={imageAlt} className="size-full rounded-none" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Badges badges={badges} />
        <div className="text-h3 wrap-anywhere">{title}</div>
        {price === undefined ? null : <p className={priceClass}>{price}</p>}
        <p className="text-caption text-muted-foreground">{meta}</p>
        {footer}
      </div>
    </article>
  );
}
