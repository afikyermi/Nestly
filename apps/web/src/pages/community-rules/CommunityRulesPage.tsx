import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { PATHS } from '@/app/paths';
import { documentTitle } from '@/lib/document-title';
import { COMMUNITY_RULES, HOTLINES_LINK_LABEL, HOTLINES_RULE_INDEX, RULES_CLOSING, RULES_TITLE } from './community-rules-texts';

// The community rules page (PG-049, BR-075; F3.7 c14, Q2: signed-in only): the heading, the eight rules in order, each a bold title and its
// sentence, rule 2 linking to the medical hotlines page (F3.8), and the closing line. Static: no request, no state. Reached from the side menu,
// focus lands on the heading (the drawer returns it to `data-initial-focus`); a direct load, or the report window's new tab, keeps the browser's
// focus (the skip link stays the first Tab stop).
export function CommunityRulesPage() {
  const { key } = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (key !== 'default') headingRef.current?.focus({ preventScroll: true });
  }, [key]);

  return (
    <div className="flex min-w-0 max-w-md flex-col">
      <title>{documentTitle(RULES_TITLE)}</title>
      <h1 ref={headingRef} tabIndex={-1} data-initial-focus="" className="text-h2">
        {RULES_TITLE}
      </h1>
      <ol aria-label={RULES_TITLE} className="mt-5 flex list-decimal flex-col gap-3 ps-6 text-body">
        {COMMUNITY_RULES.map((rule, index) => (
          <li key={rule.title}>
            <strong className="font-semibold">{rule.title}</strong>
            {rule.text !== undefined ? ` — ${rule.text}` : null}
            {index === HOTLINES_RULE_INDEX ? (
              <>
                {' '}
                <Link to={PATHS.medicalHotlines} className="inline-flex min-h-11 items-center text-primary-strong underline underline-offset-4">
                  {HOTLINES_LINK_LABEL}
                </Link>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-5 text-body text-muted-foreground">{RULES_CLOSING}</p>
    </div>
  );
}
