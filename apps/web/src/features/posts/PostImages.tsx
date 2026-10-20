import type { MediaImage } from '@nestly/shared';
import { MediaTile } from '@/components/shared/media-tile';
import { cn } from '@/lib/cn';
import { imageAlt } from '@/lib/media-texts';

export interface PostImagesProps {
  images: readonly MediaImage[] | undefined;
  /** Placement only. */
  className?: string;
}

// A post's images (FR-FEED-002, AC-021; I5): one shown whole, two to four in a two-column grid. Each image as the viewer may see it
// (MediaTile). Nothing when the post has none.
export function PostImages({ images, className }: PostImagesProps) {
  if (images === undefined || images.length === 0) return null;
  const single = images.length === 1;
  return (
    <div data-testid="post-images" className={cn(single ? 'w-full' : 'grid w-full grid-cols-2 gap-2', className)}>
      {images.map((image, index) => (
        <MediaTile
          key={image.id}
          image={image}
          alt={imageAlt(index, images.length)}
          fit={single ? 'contain' : 'cover'}
          className={single ? 'max-h-[28rem] w-full' : 'aspect-square w-full'}
        />
      ))}
    </div>
  );
}
