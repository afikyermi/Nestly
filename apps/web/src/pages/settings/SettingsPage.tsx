import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { PATHS } from '@/app/paths';
import { PrivacySettingsSection } from '@/features/privacy/PrivacySettingsSection';
import { documentTitle } from '@/lib/document-title';
import { parseSettingsSection, SETTINGS_SECTIONS, type SettingsSectionId } from '@/lib/settings-sections';
import { SettingsLink } from './SettingsLink';

const TITLE = 'הגדרות';
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

// Settings (PG-038, FR-SET-001; F2.5): Account, Privacy & Security (F2.3's form and the two security links) and Terms & Privacy, one
// `h2` each. A section's address is the hash of this path; the section it names gets focus (WCAG 2.4.3), so the menu lands on its
// heading. An unknown hash shows the top. The page sends no request of its own: the Privacy section loads and fails on its own, and
// the other two hold only links. No account deletion and no notification settings until their features exist (I9, I7).
export function SettingsPage() {
  const { hash, key } = useLocation();
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
  }, [section, key]);

  return (
    <>
      <title>{documentTitle(TITLE)}</title>
      <h1 className="text-h2">{TITLE}</h1>
      <div ref={rootRef} className="mt-5 flex flex-col gap-8">
        <LinkSection id="account">
          <SettingsLink to={PATHS.profile}>עריכת פרופיל</SettingsLink>
        </LinkSection>
        <div data-settings-section="privacy" className="scroll-mt-20">
          <PrivacySettingsSection />
          <div className="mt-4 flex flex-wrap items-start gap-x-4">
            <SettingsLink to={PATHS.recoveryQuestions}>שאלות לשחזור סיסמה</SettingsLink>
            <SettingsLink to={PATHS.changePassword}>החלפת סיסמה</SettingsLink>
          </div>
        </div>
        <LinkSection id="terms">
          <SettingsLink to={PATHS.terms}>תנאי השימוש</SettingsLink>
          <SettingsLink to={PATHS.privacy}>מדיניות הפרטיות</SettingsLink>
        </LinkSection>
      </div>
    </>
  );
}
