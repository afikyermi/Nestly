import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { POST_SHARE_TITLE, SITE_SHARE_TITLE, siteLinkOf } from '@nestly/shared';
import type { ShareLinkSheetProps } from '@/components/domain/share-link-sheet';
import type { DeviceShare } from '@/platform/browser-share';
import { LinkCopierContext } from './use-copy-profile-link';

// App provides the browser's share sheet; without a provider the "אפשרויות נוספות" option is not offered (a story, a test).
export const DeviceShareContext = createContext<DeviceShare>({ available: () => false, share: () => Promise.resolve('failed') });

/** What the window shares: a post's link, or the site's (F3.6 c11). */
export type ShareLinkSubject = 'post' | 'site';

/** The open window: what it shares, the link, and what the last copy did (idle, copied, or shown in the field after a failure; c5). */
export interface ShareLinkSheetState {
  subject: ShareLinkSubject;
  /** The card or page whose button opened it (focus goes back there); null for the side menu's. */
  openerId: string | null;
  title: string;
  url: string;
  copy: 'idle' | 'copied' | 'shown';
  /** Counts copy results, so the same one twice is said and focused again. */
  tick: number;
}

export interface ShareLinkFlow {
  sheet: ShareLinkSheetState | null;
  /** The app's address: the origin of every link (production's own domain in production). Empty without a provider. */
  origin: string;
  /** Whether the device has its own share sheet. */
  canShareDevice: boolean;
  /** Opens the window with a post's link (built by postLinkOf), naming the unit that opened it, or the site's. */
  openPost: (url: string, openerId: string) => void;
  openSite: () => void;
  close: () => void;
  copy: () => void;
  more: () => void;
}

// The share-link window's flow (F3.6 c4, c5, c11; FR-FEED-007): nothing goes to the server. WhatsApp and email are plain links the window
// draws; copying writes the link to the clipboard, and a refusal (or no Clipboard API) shows it in a field to copy by hand; the device
// sheet gets the title and the link only, a cancel by the person shows nothing and any other failure falls back as a copy failure.
export function useShareLink(): ShareLinkFlow {
  const copier = useContext(LinkCopierContext);
  const device = useContext(DeviceShareContext);
  const [sheet, setSheet] = useState<ShareLinkSheetState | null>(null);
  const latest = useRef(sheet);
  latest.current = sheet;

  const settle = useCallback((copy: 'copied' | 'shown') => {
    setSheet((now) => (now === null ? null : { ...now, copy, tick: now.tick + 1 }));
  }, []);

  const copy = useCallback(() => {
    const now = latest.current;
    if (now === null) return;
    void copier.writeText(now.url).then((written) => settle(written ? 'copied' : 'shown'));
  }, [copier, settle]);

  const more = useCallback(() => {
    const now = latest.current;
    if (now === null) return;
    void device.share({ title: now.title, url: now.url }).then((outcome) => {
      if (outcome === 'failed') settle('shown');
    });
  }, [device, settle]);

  const open = (subject: ShareLinkSubject, url: string, openerId: string | null) =>
    setSheet({ subject, openerId, title: subject === 'post' ? POST_SHARE_TITLE : SITE_SHARE_TITLE, url, copy: 'idle', tick: 0 });

  return {
    sheet,
    origin: copier.origin(),
    canShareDevice: device.available(),
    openPost: (url, openerId) => open('post', url, openerId),
    openSite: () => open('site', siteLinkOf(copier.origin()), null),
    close: () => setSheet(null),
    copy,
    more,
  };
}

/** The window's props from the open sheet and the flow (ShareLinkSheet), less where focus returns, which only the screen knows. */
export function shareLinkSheetProps(flow: ShareLinkFlow, sheet: ShareLinkSheetState, heading: string) {
  return {
    heading,
    title: sheet.title,
    url: sheet.url,
    canShareDevice: flow.canShareDevice,
    copy: sheet.copy,
    copyTick: sheet.tick,
    onCopy: flow.copy,
    onMore: flow.more,
    onClose: flow.close,
  } satisfies Omit<ShareLinkSheetProps, 'finalFocus'>;
}
