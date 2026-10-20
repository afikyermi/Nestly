import { useEffect, useRef } from 'react';
import { shareTargetsOf } from '@nestly/shared';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { MenuItem } from '@/components/shared/menu-item';
import { Button } from '@/components/ui/button';
import { SheetPanel, SheetTitle } from '@/components/ui/dialog';
import { TextInput } from '@/components/ui/text-input';
import {
  COPY_FAILED_TEXT,
  COPY_LINK_LABEL,
  EMAIL_LABEL,
  LINK_COPIED_STATUS,
  LINK_FIELD_LABEL,
  MORE_OPTIONS_LABEL,
  NEW_WINDOW_NOTE,
  SHARE_LINK_CLOSE_LABEL,
  WHATSAPP_LABEL,
} from '@/lib/share-link-texts';

export interface ShareLinkSheetProps {
  /** The window's name: "שיתוף קישור" for a post, "שיתוף Nestly" for the site. */
  heading: string;
  /** The words the link travels with ("פוסט ב-Nestly" or "Nestly"); never anything of the post. */
  title: string;
  url: string;
  /** Whether "אפשרויות נוספות" (the device's own share sheet) is offered. */
  canShareDevice: boolean;
  /** What the last copy did: nothing yet, on the clipboard, or refused (the link is shown in a field, selected). */
  copy: 'idle' | 'copied' | 'shown';
  /** Counts copy results: the field is focused and selected again on each refusal. */
  copyTick: number;
  onCopy: () => void;
  onMore: () => void;
  /** סגירה, Escape, a press outside: the caller closes the window. */
  onClose: () => void;
  /** Where focus goes when it closes; unset or null: back to the element that opened it. */
  finalFocus?: (() => HTMLElement | null) | undefined;
}

// The share-link window (F3.6 c4, c5, c11, c12; FR-FEED-007) on the shared sheet: WhatsApp and email as links that open the person's own
// app, "העתקת קישור", and "אפשרויות נוספות" where the device has its own sheet; the link carries the post id only (BR-067). Display only:
// what copying and the device sheet do comes in as props. Focus starts on the first option and stays inside; no request is made here.
export function ShareLinkSheet(props: ShareLinkSheetProps) {
  const { heading, title, url, canShareDevice, copy, copyTick, onCopy, onMore, onClose, finalFocus } = props;
  const fieldRef = useRef<HTMLDivElement>(null);
  const targets = shareTargetsOf(title, url);

  useEffect(() => {
    if (copy !== 'shown') return;
    const field = fieldRef.current?.querySelector('input');
    field?.focus();
    field?.select();
  }, [copy, copyTick]);

  return (
    <SheetPanel
      open
      described={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onOpened={(panel) => panel.querySelector<HTMLElement>('a[href]')?.focus()}
      finalFocus={finalFocus}
    >
      <SheetTitle>{heading}</SheetTitle>
      <ul className="flex flex-col gap-1">
        <li>
          <MenuItem href={targets.whatsapp} target="_blank" rel="noopener noreferrer">
            {WHATSAPP_LABEL}
            <span className="sr-only"> {NEW_WINDOW_NOTE}</span>
          </MenuItem>
        </li>
        <li>
          <MenuItem href={targets.email} target="_blank" rel="noopener noreferrer">
            {EMAIL_LABEL}
          </MenuItem>
        </li>
        <li>
          <MenuItem onClick={onCopy}>{COPY_LINK_LABEL}</MenuItem>
        </li>
        {canShareDevice ? (
          <li>
            <MenuItem onClick={onMore}>{MORE_OPTIONS_LABEL}</MenuItem>
          </li>
        ) : null}
      </ul>
      {/* One polite region, present from the first render, so "הקישור הועתק" is said. */}
      <p role="status" className={copy === 'copied' ? 'text-body text-muted-foreground' : 'sr-only'}>
        {copy === 'copied' ? LINK_COPIED_STATUS : ''}
      </p>
      {copy === 'shown' ? (
        <div ref={fieldRef} className="flex flex-col gap-3">
          <InlineAlert>{COPY_FAILED_TEXT}</InlineAlert>
          <FormField label={LINK_FIELD_LABEL}>{(control) => <TextInput {...control} dir="ltr" readOnly value={url} />}</FormField>
        </div>
      ) : null}
      <Button variant="text" className="self-center" onClick={onClose}>
        {SHARE_LINK_CLOSE_LABEL}
      </Button>
    </SheetPanel>
  );
}
