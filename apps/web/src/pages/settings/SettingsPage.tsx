import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { PATHS } from '@/app/paths';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccountKind, type AccountKindState } from '@/hooks/use-account-kind';
import { useSessionAccount } from '@/hooks/use-session-account';
import { fetchAccountKind } from '@/services/api/professionals';
import { NotificationSettings } from '@/features/notifications/NotificationSettings';
import { BlockedUsersSection } from '@/features/blocks/BlockedUsersSection';
import { PrivacySettingsSection } from '@/features/privacy/PrivacySettingsSection';
import { DELETE_LINK } from '@/lib/account-deletion-texts';
import { documentTitle } from '@/lib/document-title';
import { parseSettingsSection, SETTINGS_SECTIONS, type SettingsSectionId } from '@/lib/settings-sections';
import { SettingsLink } from './SettingsLink';

const TITLE = 'הגדרות';
const KIND_FAILED_TEXT = 'לא הצלחנו לטעון את ההגדרות. אפשר לנסות שוב';
const RETRY_LABEL = 'נסו שוב';
const sectionLabel = (id: SettingsSectionId) => SETTINGS_SECTIONS.find((section) => section.id === id)?.label ?? '';

function LinkSection({ id, children }: { id: SettingsSectionId; children: ReactNode }) {
  return (
    <section data-settings-section={id} aria-labelledby={`settings-${id}`} className="scroll-mt-20">
      <h2 id={`settings-${id}`} className="text-h3">
        {sectionLabel(id)}
      </h2>
      <div className="mt-2 flex flex-col items-start">{children}</div>
    </section>
  );
}

// Settings (PG-038, FR-SET-001; F2.5): Account, Privacy & Security (F2.3's form, the two security links and the blocked list, FR-REL-002) and Terms & Privacy, one
// `h2` each. By account kind (SRS audit 21.10.2026): a Regular account gets all of it; a Professional edits its Professional profile and has no
// profile-privacy form (FR-PRIV-001 is a Regular profile's); a staff account has no profile, no blocked list and no notification settings
// (FR-NOTIF-002), so only the password links and the terms. The kind is the server's answer (presentation only). A section's address is the hash of this path; the section it names gets focus (WCAG 2.4.3), so the menu lands on its
// heading. An unknown hash shows the top. The page sends no request of its own: the Privacy section loads and fails on its own, and
// the other two hold only links. Account deletion (FR-SET-002, I9) is a link in Account, for a Regular or Professional account only. Notification Settings load and fail on their own.
export function SettingsPage() {
  const { hash, key } = useLocation();
  const shared = useAccountKind();
  const account = useSessionAccount();
  // Which sections apply depends on the account's kind. When the shared answer did not come (unknown, or no account), the page never guesses
  // the Regular screens: it says so and asks again on "נסו שוב" (SRS audit 21.10.2026).
  const [asked, setAsked] = useState<AccountKindState | null>(null);
  const kind = asked ?? shared;
  const retry = useCallback(async () => {
    setAsked('loading');
    const token = account === null ? null : await account.getAccessToken().catch(() => null);
    const result = token === null ? ({ kind: 'failed' } as const) : await fetchAccountKind(token);
    setAsked(result.kind === 'ok' ? result.value : 'unknown');
  }, [account]);
  const section = parseSettingsSection(hash);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (section === null) return;
    const wrapper = rootRef.current?.querySelector<HTMLElement>(`[data-settings-section="${section}"]`);
    const heading = wrapper?.querySelector<HTMLElement>('h2');
    if (wrapper === undefined || wrapper === null || heading === null || heading === undefined) return;
    heading.tabIndex = -1;
    // The shell's menu returns focus here, not to `main`, when it closes after choosing this section.
    heading.setAttribute('data-initial-focus', '');
    // The section scrolls to the top, clear of the sticky top bar (its scroll margin), and its heading takes focus.
    heading.focus({ preventScroll: true });
    wrapper.scrollIntoView();
    return () => heading.removeAttribute('data-initial-focus');
  }, [section, key, kind]);

  if (kind === 'loading') {
    return (
      <>
        <title>{documentTitle(TITLE)}</title>
        <h1 className="text-h2">{TITLE}</h1>
        <Skeleton className="mt-5 h-64 w-full" />
      </>
    );
  }
  if (kind === 'unknown' || kind === 'none') {
    return (
      <>
        <title>{documentTitle(TITLE)}</title>
        <h1 className="text-h2">{TITLE}</h1>
        <div className="mt-5 flex flex-col items-start gap-3">
          <InlineAlert>{KIND_FAILED_TEXT}</InlineAlert>
          <Button type="button" variant="soft" onClick={() => void retry()}>
            {RETRY_LABEL}
          </Button>
        </div>
      </>
    );
  }
  const staff = kind === 'staff';
  const professional = kind === 'professional';

  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <div ref={rootRef} className="mt-5 flex flex-col gap-8">
        {staff ? null : (
          <LinkSection id="account">
            <SettingsLink to={professional ? PATHS.proProfile : PATHS.profile}>עריכת פרופיל</SettingsLink>
            <SettingsLink to={PATHS.deleteAccount}>{DELETE_LINK}</SettingsLink>
          </LinkSection>
        )}
        <div data-settings-section="privacy" className="scroll-mt-20">
          {staff || professional ? (
            <h2 id="settings-privacy" className="text-h3">
              {sectionLabel('privacy')}
            </h2>
          ) : (
            <PrivacySettingsSection />
          )}
          <div className="mt-4 flex flex-wrap items-start gap-x-4">
            <SettingsLink to={PATHS.recoveryQuestions}>שאלות לשחזור סיסמה</SettingsLink>
            <SettingsLink to={PATHS.changePassword}>החלפת סיסמה</SettingsLink>
          </div>
          {staff ? null : (
            <div className="mt-6">
              <BlockedUsersSection />
            </div>
          )}
        </div>
        {staff ? null : <NotificationSettings />}
        <LinkSection id="terms">
          <SettingsLink to={PATHS.terms}>תנאי השימוש</SettingsLink>
          <SettingsLink to={PATHS.privacy}>מדיניות הפרטיות</SettingsLink>
        </LinkSection>
      </div>
    </>
  );
}
