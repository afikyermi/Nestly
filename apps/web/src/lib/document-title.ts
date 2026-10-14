import { APP_NAME } from '@nestly/shared';

// The document title of a screen (WCAG 2.4.2): "<screen> · Nestly", or "Nestly" alone for the entry screen.
export function documentTitle(screen?: string): string {
  return screen === undefined ? APP_NAME : `${screen} · ${APP_NAME}`;
}
