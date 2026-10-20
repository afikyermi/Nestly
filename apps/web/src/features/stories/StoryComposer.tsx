import { useRef, useState } from 'react';
import { STORY_AUDIENCES, STORY_CAPTION_MAX, type StoryAudience } from '@nestly/shared';
import { ChoiceCardGroup } from '@/components/shared/choice-card-group';
import { FormField } from '@/components/shared/form-field';
import { FieldHint } from '@/components/shared/field-message';
import { InlineAlert } from '@/components/shared/inline-alert';
import { MediaTile } from '@/components/shared/media-tile';
import { Button } from '@/components/ui/button';
import { SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextArea } from '@/components/ui/text-area';
import type { AudienceMemory } from '@/hooks/use-audience-memory';
import { usePickedImages } from '@/hooks/use-picked-images';
import { useSessionAccount } from '@/hooks/use-session-account';
import { UPLOADING_TEXT } from '@/lib/media-texts';
import { createStory } from '@/services/api/media';
import {
  AUDIENCE_LABELS,
  AUDIENCE_LEGEND,
  CANCEL_LABEL,
  CAPTION_LABEL,
  CAPTION_TOO_LONG_TEXT,
  charactersLeft,
  EXPIRES_HINT,
  IMAGE_REQUIRED_TEXT,
  LIMIT_TEXT,
  NEW_STORY_TITLE,
  PENDING_HINT,
  PICK_IMAGE_LABEL,
  PUBLISH_FAILED_TEXT,
  PUBLISH_LABEL,
  PUBLISHING_TEXT,
} from './stories-texts';

const isAudience = (value: string): value is StoryAudience => STORY_AUDIENCES.some((audience) => audience === value);

export interface StoryComposerProps {
  open: boolean;
  /** The last Story audience of this user (OP-033, Afik 18.10.2026): "everyone" when none. */
  memory: AudienceMemory;
  onClose: () => void;
  onPublished: () => void;
}

// A new Story (FR-FEED-008): one picture (shrunk in the browser, uploaded at once), optional text up to 200 characters (VAL-042), the audience
// "כולם" or "חברים בלבד", preselected on the last choice. The eleventh in 24 hours is refused by the server (ERR-040).
export function StoryComposer({ open, memory, onClose, onPublished }: StoryComposerProps) {
  const account = useSessionAccount();
  const picture = usePickedImages('story', 1);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<StoryAudience>(() => memory.read() ?? 'everyone');
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const image = picture.items[0];
  const left = STORY_CAPTION_MAX - [...caption.trim()].length;

  async function publish() {
    if (sending || picture.busy) return;
    const mediaId = picture.ids[0];
    if (mediaId === undefined) return setFailure(IMAGE_REQUIRED_TEXT);
    if (left < 0) return setFailure(CAPTION_TOO_LONG_TEXT);
    setSending(true);
    setFailure(null);
    const token = account === null ? null : await account.getAccessToken().catch(() => null);
    const outcome = token === null ? null : await createStory(token, { mediaId, audience, ...(caption.trim() === '' ? {} : { caption: caption.trim() }) });
    setSending(false);
    if (outcome?.kind === 'ok') {
      memory.write(audience);
      onPublished();
      return;
    }
    setFailure(outcome?.kind === 'story-limit' ? LIMIT_TEXT : outcome?.kind === 'caption-too-long' ? CAPTION_TOO_LONG_TEXT : PUBLISH_FAILED_TEXT);
  }

  return (
    <SheetPanel open={open} onOpenChange={(next) => (next ? undefined : onClose())} described={false}>
      <SheetTitle>{NEW_STORY_TITLE}</SheetTitle>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void publish();
        }}
      >
        {failure !== null ? <InlineAlert>{failure}</InlineAlert> : null}
        {picture.error !== null ? <InlineAlert>{picture.error}</InlineAlert> : null}
        {image === undefined ? null : image.image === undefined ? (
          <p role="status" className="grid aspect-3/4 max-h-80 place-items-center rounded-md bg-muted text-small text-muted-foreground">
            {UPLOADING_TEXT}
          </p>
        ) : (
          <MediaTile image={image.image} alt={NEW_STORY_TITLE} fit="contain" className="max-h-80 w-full" />
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = event.target.files === null ? [] : [...event.target.files];
            event.target.value = '';
            if (image !== undefined) picture.remove(image.key);
            if (files.length > 0) picture.add(files.slice(0, 1));
          }}
        />
        <Button variant="soft" className="self-start" onClick={() => input.current?.click()} disabled={sending}>
          {PICK_IMAGE_LABEL}
        </Button>
        <div className="flex flex-col gap-1.5">
          <FormField label={CAPTION_LABEL} htmlFor="story-caption" {...(left < 0 ? { error: CAPTION_TOO_LONG_TEXT } : {})}>
            {(control) => <TextArea {...control} value={caption} onChange={(event) => setCaption(event.target.value)} />}
          </FormField>
          <p role="status" className="text-small text-muted-foreground empty:sr-only">
            {left <= 40 ? charactersLeft(Math.max(0, left)) : ''}
          </p>
        </div>
        <ChoiceCardGroup
          legend={AUDIENCE_LEGEND}
          name="story-audience"
          options={STORY_AUDIENCES.map((value) => ({ value, label: AUDIENCE_LABELS[value] }))}
          value={audience}
          onChange={(value) => {
            if (isAudience(value)) setAudience(value);
          }}
        />
        <FieldHint id="story-hint">{`${EXPIRES_HINT}. ${PENDING_HINT}`}</FieldHint>
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" block pending={sending} disabled={sending || picture.busy}>
            {sending ? PUBLISHING_TEXT : PUBLISH_LABEL}
          </Button>
          <Button variant="text" className="self-center" onClick={onClose}>
            {CANCEL_LABEL}
          </Button>
        </div>
      </form>
    </SheetPanel>
  );
}
