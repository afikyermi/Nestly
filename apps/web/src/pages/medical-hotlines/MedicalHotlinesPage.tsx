import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { MEDICAL_HOTLINES } from '@nestly/shared';
import { PhoneIcon } from '@/components/ui/icons';
import { documentTitle } from '@/lib/document-title';
import { HOTLINES_DISCLAIMER, HOTLINES_LIST_LABEL, HOTLINES_TITLE } from './medical-hotlines-texts';

// The medical hotlines page (PG-047, FR-MENU-002, AC-109; F3.8): the heading, the disclaimer, and one `tel:` link per entry of
// MEDICAL_HOTLINES, in its order. Nothing else: no request, no handler on a link, no storage, no record of a visit or a tap (AC-109,
// decision 16.10 (4)); a tap hands off to the phone, and a desktop user reads the number. The number is its own left-to-right run, so a
// `*NNNN` code does not flip. The link's name is its own text, "<service>, <number>" (the comma is for screen readers only), so the visible
// words are the name (WCAG 2.5.3). Reached from the side menu, focus lands on the heading (the drawer returns it to `data-initial-focus`); a
// direct load keeps the browser's focus (the skip link stays the first Tab stop).
export function MedicalHotlinesPage() {
  const { key } = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (key !== 'default') headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  return (
    <>
      <title>{documentTitle(HOTLINES_TITLE)}</title>
      <h1 ref={headingRef} tabIndex={-1} data-initial-focus="" className="text-h2">
        {HOTLINES_TITLE}
      </h1>
      <p className="mt-2 text-body text-muted-foreground">{HOTLINES_DISCLAIMER}</p>
      <ul aria-label={HOTLINES_LIST_LABEL} className="mt-5 flex flex-col gap-3">
        {MEDICAL_HOTLINES.map((hotline) => (
          <li key={hotline.id}>
            <a
              href={`tel:${hotline.number}`}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg bg-card px-4 py-3 text-body text-card-foreground no-underline shadow-card transition-colors duration-fast ease-standard hover:bg-muted"
            >
              <PhoneIcon className="size-5 text-primary-strong" />
              <span className="min-w-0 flex-1 text-label">
                {hotline.label}
                <span className="sr-only">,</span>
              </span>{' '}
              <span dir="ltr" className="text-label">
                {hotline.number}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
