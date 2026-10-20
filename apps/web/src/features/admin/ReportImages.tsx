import { useState } from 'react';
import type { MediaImage, PermissionKey } from '@nestly/shared';
import { MediaTile } from '@/components/shared/media-tile';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { useAdminCall } from '@/hooks/use-admin-call';
import { removeMediaAfterReport } from '@/services/api/admin';
import {
  FORBIDDEN_TEXT,
  LOAD_FAILED_TEXT,
  MEDIA_GONE_TEXT,
  MEDIA_SUSPECT_HINT,
  MEDIA_SUSPECT_LABEL,
  REPORT_IMAGE_REMOVE_LABEL,
  REPORT_IMAGE_REMOVED_TEXT,
  REPORT_IMAGES_LABEL,
  reportImageAlt,
} from './admin-texts';

export interface ReportImagesProps {
  images: readonly MediaImage[];
  permissions: readonly PermissionKey[];
  /** A ground for removal: a report on the target that is open, or was handled with action taken (never only dismissed ones). */
  hasGround: boolean;
}

// A reported post's images (BR-076 as of 20.10.2026): what the staff member may see of them. With CONTENT_MODERATE and REPORTS_VIEW, an image
// that had passed the check can be removed after the report, or marked as a suspicion of child abuse (removed, kept 90 days, shown to nobody);
// the uploader sees the same rejection either way. Only while a report is open or after one handled with action taken (a dismissed report is
// no ground); the database decides whether the removal applies.
export function ReportImages({ images, permissions, hasGround }: ReportImagesProps) {
  const call = useAdminCall();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canRemove = hasGround && permissions.includes('CONTENT_MODERATE') && permissions.includes('REPORTS_VIEW');

  const remove = async (id: string, suspected: boolean) => {
    setBusy(`${id}:${String(suspected)}`);
    setError('');
    const outcome = await call((token) => removeMediaAfterReport(token, id, suspected));
    setBusy(null);
    if (outcome.kind === 'ok' || outcome.kind === 'not-found') {
      setRemoved((now) => new Set([...now, id]));
      setNotice(outcome.kind === 'ok' ? REPORT_IMAGE_REMOVED_TEXT : MEDIA_GONE_TEXT);
    } else {
      setError(outcome.kind === 'forbidden' ? FORBIDDEN_TEXT : LOAD_FAILED_TEXT);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={REPORT_IMAGES_LABEL} className="grid grid-cols-2 gap-2">
        {images.map((image, index) => (
          <li key={image.id} className="flex flex-col gap-2">
            <MediaTile image={removed.has(image.id) ? { ...image, state: 'rejected', url: null } : image} alt={reportImageAlt(index, images.length)} className="aspect-square w-full" />
            {canRemove && image.state === 'ready' && !removed.has(image.id) ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" onClick={() => void remove(image.id, false)} pending={busy === `${image.id}:false`} disabled={busy !== null && busy !== `${image.id}:false`}>
                  {REPORT_IMAGE_REMOVE_LABEL}
                </Button>
                <Button variant="soft" onClick={() => void remove(image.id, true)} pending={busy === `${image.id}:true`} disabled={busy !== null && busy !== `${image.id}:true`}>
                  {MEDIA_SUSPECT_LABEL}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canRemove ? <p className="text-small text-muted-foreground">{MEDIA_SUSPECT_HINT}</p> : null}
      <p role="status" className="text-small">
        {notice}
      </p>
      {error === '' ? null : <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
