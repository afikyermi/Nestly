import type { PostFormValues } from './post-form';

// The unsent composition of the feed's composer (feed-composer c4, c5, c6): text, audience, tag and the anonymous box, kept in memory
// for one browser session, for the user id the access token named. Never in storage: a reload, a closed tab or signing out loses it
// (RouteGuard forgets it). A composition with non-blank text also asks the browser to confirm leaving the page.
export interface ComposeDraft {
  values: PostFormValues;
  anonymous: boolean;
}

let kept: { owner: string; draft: ComposeDraft } | null = null;
let unsent = false;

const confirmLeave = (event: BeforeUnloadEvent) => {
  if (unsent) event.preventDefault();
};
let listening = false;

function sync(): void {
  if (unsent && !listening) window.addEventListener('beforeunload', confirmLeave);
  else if (!unsent && listening) window.removeEventListener('beforeunload', confirmLeave);
  listening = unsent;
}

// I10: a Group's composer keeps its own draft (owner key `<user>#<group>`), apart from the feed's one slot.
const groupKept = new Map<string, ComposeDraft>();
const isGroupOwner = (owner: string): boolean => owner.includes('#');
function anyUnsent(): boolean {
  return (kept !== null && kept.draft.values.body.trim() !== '') || [...groupKept.values()].some((d) => d.values.body.trim() !== '');
}

/** Remembers the composition; without a known owner it is not recalled, but non-blank text still guards leaving the page. */
export function keepDraft(owner: string | null, draft: ComposeDraft): void {
  if (owner !== null && isGroupOwner(owner)) groupKept.set(owner, draft);
  else kept = owner === null ? null : { owner, draft };
  unsent = anyUnsent();
  sync();
}

/** The kept composition, only for the user it was kept for. */
export function recallDraft(owner: string | null): ComposeDraft | null {
  if (owner !== null && isGroupOwner(owner)) return groupKept.get(owner) ?? null;
  return kept !== null && owner !== null && kept.owner === owner ? kept.draft : null;
}

/** No owner: every draft (the session ended). A Group's key: that Group's draft only. Any other owner: the feed's draft. */
export function forgetDraft(owner?: string | null): void {
  if (owner === undefined) {
    kept = null;
    groupKept.clear();
  } else if (owner !== null && isGroupOwner(owner)) groupKept.delete(owner);
  else kept = null;
  unsent = anyUnsent();
  sync();
}

// "Focus the composer's text", asked by the old /posts/new address and taken once by the feed: in memory, so a reload shows it idle (c11).
let openRequested = false;

export function requestComposer(): void {
  openRequested = true;
}

export function takeComposerRequest(): boolean {
  const asked = openRequested;
  openRequested = false;
  return asked;
}

// A post being sent (c3: one request at a time). Module-level, so leaving the feed and coming back during "מפרסמים" cannot send a second
// copy; the draft is cleared when the send starts and put back by a failure only if nothing newer was kept meanwhile.
let sendingNow = false;
const watchers = new Set<(sending: boolean) => void>();

export const isSending = (): boolean => sendingNow;

export function setSending(sending: boolean): void {
  sendingNow = sending;
  watchers.forEach((watch) => watch(sending));
}

export function watchSending(watch: (sending: boolean) => void): () => void {
  watchers.add(watch);
  return () => {
    watchers.delete(watch);
  };
}
