// The history entry an open overlay (a card's menu, its confirmation) adds on top of the screen's own (direction.md "דפוסי אינטראקציה":
// Back closes it and stays on the screen; F3.9 c8, c13). Same address; only the entry's state carries the mark. No DOM.
const OVERLAY_MARK = 'nestlyOverlay';

/** The state of the overlay entry: the screen's own state with the mark. */
export function overlayState(state: unknown): Record<string, unknown> {
  return { ...(typeof state === 'object' && state !== null ? state : {}), [OVERLAY_MARK]: true };
}

/** True when a history entry's state is an overlay's. */
export function isOverlayState(state: unknown): boolean {
  return typeof state === 'object' && state !== null && Reflect.get(state, OVERLAY_MARK) === true;
}
