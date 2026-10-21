import { useId, useRef } from 'react';
import { MEDIA_SOURCE_TYPES } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { MediaTile } from '@/components/shared/media-tile';
import { Button } from '@/components/ui/button';
import { CloseIcon, PlusIcon } from '@/components/ui/icons';
import { ADD_IMAGE_LABEL, imageAlt, REMOVE_IMAGE_LABEL, UPLOADING_TEXT } from '@/lib/media-texts';
import type { PickedImage } from '@/hooks/use-picked-images';

export interface ImagesPickerProps {
  items: readonly PickedImage[];
  error: string | null;
  /** No more can be added (VAL-041). */
  full: boolean;
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: number) => void;
}

// Pictures being picked for a post (FR-FEED-002; I5) or a Marketplace listing (FR-MKT-002; I12): "הוספת תמונה" opens the device's picker; each
// picture shows while it uploads, then as the uploader sees it ("ממתין לבדיקה" until the check), with "הסרת התמונה". Display only: picking and
// uploading come in as props.
export function ImagesPicker({ items, error, full, disabled = false, onAdd, onRemove }: ImagesPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2" aria-label={ADD_IMAGE_LABEL}>
          {items.map((item, index) => (
            <li key={item.key} className="relative">
              {item.image === undefined ? (
                <p role="status" className="grid aspect-square place-items-center rounded-md bg-muted text-small text-muted-foreground">
                  {UPLOADING_TEXT}
                </p>
              ) : (
                <MediaTile image={item.image} alt={imageAlt(index, items.length)} className="aspect-square w-full" />
              )}
              <Button iconOnly label={`${REMOVE_IMAGE_LABEL} ${index + 1}`} className="absolute end-2 bottom-2 bg-card" onClick={() => onRemove(item.key)}>
                <CloseIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {error !== null ? <InlineAlert>{error}</InlineAlert> : null}
      <input
        ref={input}
        id={id}
        type="file"
        accept={[...MEDIA_SOURCE_TYPES, '.heic', '.heif'].join(',')}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = event.target.files === null ? [] : [...event.target.files];
          event.target.value = '';
          if (files.length > 0) onAdd(files);
        }}
      />
      {full ? null : (
        <Button variant="soft" className="self-start" disabled={disabled} onClick={() => input.current?.click()}>
          <PlusIcon />
          {ADD_IMAGE_LABEL}
        </Button>
      )}
    </div>
  );
}
