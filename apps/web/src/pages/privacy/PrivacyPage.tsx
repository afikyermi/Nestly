import { GuestPlaceholderPage } from '@/pages/placeholder/GuestPlaceholderPage';
import { PRIVACY_SECTIONS, PRIVACY_TITLE } from './privacy-texts';

export function PrivacyPage() {
  return (
    <GuestPlaceholderPage title={PRIVACY_TITLE}>
      <div className="flex flex-col gap-5 text-body">
        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h2 className="mb-2 text-h3">{section.title}</h2>
            <p>{section.text}</p>
          </section>
        ))}
      </div>
    </GuestPlaceholderPage>
  );
}
