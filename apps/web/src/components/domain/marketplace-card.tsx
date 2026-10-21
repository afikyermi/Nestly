import type { ReactNode } from 'react';
import type { MediaImage } from '@nestly/shared';
import { MediaTile } from '@/components/shared/media-tile';
import { cn } from '@/lib/cn';

export interface MarketplaceCardProps {
  /** `listing`: a user's own item (organic); `sponsored`: a company's product, always marked (BR-005, AC-008, AC-020). */
  variant: 'listing' | 'sponsored';
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

// The Marketplace item card (SRS §4.1 "כרטיס פריט Marketplace"): one component for a user's listing and a sponsored product, the variant marking
// the source (FR-MKT-003). A sponsored card carries a tinted frame and its mark first, so it is never read as a user's listing. Display only.
export function MarketplaceCard({ variant, title, image, imageAlt, price, meta, badges = [], footer, className }: MarketplaceCardProps) {
  const sponsored = variant === 'sponsored';
  return (
    <article className={cn('flex gap-3 rounded-lg p-3 shadow-card', sponsored ? 'border border-primary bg-primary-soft' : 'bg-card', className)}>
      <div className="size-24 shrink-0 overflow-hidden rounded-md bg-muted">
        {image === null ? null : <MediaTile image={image} alt={imageAlt} className="size-full" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {badges.length === 0 ? null : (
          <p className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span key={badge} className={cn('rounded-full px-2 text-caption', sponsored ? 'bg-card text-primary-strong' : 'bg-muted text-foreground')}>
                {badge}
              </span>
            ))}
          </p>
        )}
        <div className="text-h4 wrap-anywhere">{title}</div>
        {price === undefined ? null : <p className="text-label">{price}</p>}
        <p className="text-small text-muted-foreground">{meta}</p>
        {footer}
      </div>
    </article>
  );
}
