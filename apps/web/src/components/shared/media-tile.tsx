import type { MediaImage } from '@nestly/shared';
import { cn } from '@/lib/cn';
import { PENDING_LABEL, REJECTED_TEXT, UNAVAILABLE_TEXT } from '@/lib/media-texts';

export interface MediaTileProps {
  image: MediaImage;
  /** What the picture shows, for a screen reader. */
  alt: string;
  /** `cover` fills a fixed frame (grids, Stories tray); `contain` shows the whole picture. Default `cover`. */
  fit?: 'cover' | 'contain';
  /** Placement only (size of the frame, margin). */
  className?: string;
}

// One image as a reader may see it (I5; AC-105, ERR-041 as of 20.10.2026): a checked image as is; the uploader's unchecked one with the label
// "ממתין לבדיקה" over it; a refused one as a quiet panel with its sentence and no picture. Display only.
export function MediaTile({ image, alt, fit = 'cover', className }: MediaTileProps) {
  if (image.state === 'rejected' || image.url === null) {
    return (
      <div className={cn('grid place-items-center rounded-md bg-muted p-4 text-center text-small text-muted-foreground', className)}>
        <span>{image.state === 'rejected' ? REJECTED_TEXT : UNAVAILABLE_TEXT}</span>
      </div>
    );
  }
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-muted', className)}>
      <img
        src={image.url}
        alt={alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        className={cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
      />
      {image.state === 'pending' ? (
        <span className="absolute start-2 top-2 rounded-sm bg-card px-2 py-0.5 text-caption font-bold text-foreground shadow-card">{PENDING_LABEL}</span>
      ) : null}
    </div>
  );
}
