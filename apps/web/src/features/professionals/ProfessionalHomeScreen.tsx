import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { PROFILE_OPTIONAL_FIELDS, professionalTag, type HelpRequestItem, type ProfessionalDashboard } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProCall } from '@/hooks/use-pro-call';
import { HELP_REQUESTS_PATH, OFFERS_PATH, PRO_ARTICLES_PATH, PRO_PROFILE_PATH, PRO_PROMOTION_PATH, professionalPagePath } from '@/lib/professional-link';
import {
  ALL_HELP_REQUESTS,
  COMPLETENESS_DONE,
  COMPLETENESS_HEADING,
  COMPLETENESS_MISSING,
  CONTENT_HEADING,
  EDIT_PROFILE,
  HELP_HEADING,
  HELP_INTRO,
  KPI_ACCEPTANCE,
  KPI_ARTICLES,
  KPI_CHATS,
  KPI_ENGAGEMENT,
  KPI_FOLLOWERS,
  KPI_HEADING,
  KPI_NOTE,
  KPI_POSTS,
  KPI_RATING,
  LOAD_FAILED,
  MY_ARTICLES,
  NOTHING_WAITING,
  PROFILE_FIELD_NAMES,
  PROMOTION_HEADING,
  PROMOTION_NOT_YET,
  PROMOTION_TITLE,
  RETRY,
  VIEW_MY_PAGE,
  WAITING_HEADING,
  acceptanceText,
  acceptedOffersText,
  completenessLabel,
  newReviewsText,
  offersLeftText,
  unreadChatsText,
} from '@/lib/professional-texts';
import { fetchProfessionalHome } from '@/services/api/professionals';
import { HelpRequestsList } from './HelpRequestsList';

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; dashboard: ProfessionalDashboard; help: HelpRequestItem[] };

/** How many help requests the home shows; the rest are on the help-requests page. */
const HOME_HELP_ITEMS = 3;
/** The profile's fields: the three required ones are always there, and the optional ones the dashboard counts. */
const PROFILE_FIELDS_TOTAL = 3 + PROFILE_OPTIONAL_FIELDS.length;

const LINK = 'inline-flex min-h-11 items-center text-label text-primary-strong underline underline-offset-4';

/** One number in a card. */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card p-4 shadow-card">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="text-h2">{value}</dd>
    </div>
  );
}

// The Professional's home (FR-PRO-001, AC-018; Afik 21.10.2026, decisions-in-force.md §9.8): a business dashboard in place of the parent's home, in
// this order — what waits for it (unread conversations, accepted Offer Help, new reviews), the newest posts in its field (§13.4) with today's "X מתוך 100",
// the metrics (conversations, followers, rating, the Offer Help acceptance rate), the profile's completeness, the content's results, and
// promotion (I13; until then it says so). Aggregates of its own account only: never who (VAL-032).
export function ProfessionalHomeScreen() {
  const call = useProCall();
  const ids = { waiting: useId(), help: useId(), kpi: useId(), profile: useId(), content: useId(), promotion: useId() };
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  const load = useCallback(async () => {
    const result = await call(fetchProfessionalHome);
    setLoaded(result.kind === 'ok' ? { kind: 'loaded', dashboard: result.value.dashboard, help: result.value.helpRequests } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded.kind === 'loading') return <Skeleton className="h-64 w-full" />;
  if (loaded.kind === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{LOAD_FAILED}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void load()}>
          {RETRY}
        </Button>
      </div>
    );
  }
  const { dashboard, help } = loaded;
  const waiting: Array<{ key: string; text: string; href: string }> = [
    ...(dashboard.unreadChats > 0 ? [{ key: 'chats', text: unreadChatsText(dashboard.unreadChats), href: PATHS.chat }] : []),
    ...(dashboard.acceptedOffersNew > 0 ? [{ key: 'offers', text: acceptedOffersText(dashboard.acceptedOffersNew), href: OFFERS_PATH }] : []),
    ...(dashboard.reviewsNew > 0 ? [{ key: 'reviews', text: newReviewsText(dashboard.reviewsNew), href: professionalPagePath(dashboard.userId) }] : []),
  ];
  const answered = dashboard.offersAccepted + dashboard.offersDeclined;
  const filled = PROFILE_FIELDS_TOTAL - dashboard.profileMissing.length;
  const percent = Math.round((filled / PROFILE_FIELDS_TOTAL) * 100);

  return (
    <div className="flex flex-col gap-7">
      <p className="text-label text-primary-strong">{professionalTag(dashboard.field, dashboard.fieldOther)}</p>

      <section aria-labelledby={ids.waiting}>
        <h2 id={ids.waiting} className="text-h3">
          {WAITING_HEADING}
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-2 text-muted-foreground">{NOTHING_WAITING}</p>
        ) : (
          <ul aria-label={WAITING_HEADING} className="mt-3 flex flex-col gap-2">
            {waiting.map((item) => (
              <li key={item.key}>
                <Link to={item.href} className="flex min-h-11 items-center rounded-md bg-secondary px-4 text-label font-bold text-secondary-foreground no-underline hover:bg-muted">
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={ids.help}>
        <h2 id={ids.help} className="text-h3">
          {HELP_HEADING}
        </h2>
        <p className="mt-1 text-label">{offersLeftText(dashboard.offersToday, dashboard.offersPerDay)}</p>
        <p className="mt-1 text-small text-muted-foreground">{HELP_INTRO}</p>
        <HelpRequestsList items={help.slice(0, HOME_HELP_ITEMS)} onSent={load} />
        {/* §11.20: "בקשות עזרה" left the bottom navigation; its whole list is reached from here and from the menu */}
        <Link to={HELP_REQUESTS_PATH} className={`mt-2 ${LINK}`}>
          {ALL_HELP_REQUESTS}
        </Link>
      </section>

      <section aria-labelledby={ids.kpi}>
        <h2 id={ids.kpi} className="text-h3">
          {KPI_HEADING}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label={KPI_CHATS} value={String(dashboard.chatStarts30d)} />
          <Kpi label={KPI_FOLLOWERS} value={String(dashboard.followers)} />
          <Kpi label={KPI_RATING} value={dashboard.rating === null ? '—' : `${dashboard.rating.toFixed(1)} (${dashboard.reviewCount})`} />
          <Kpi label={KPI_ACCEPTANCE} value={acceptanceText(dashboard.offersAccepted, answered)} />
        </dl>
        <p className="mt-2 text-small text-muted-foreground">{KPI_NOTE}</p>
      </section>

      <section aria-labelledby={ids.profile}>
        <h2 id={ids.profile} className="text-h3">
          {COMPLETENESS_HEADING}
        </h2>
        <div
          role="progressbar"
          aria-labelledby={ids.profile}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={completenessLabel(percent)}
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-label">{completenessLabel(percent)}</p>
        <p className="mt-1 text-small text-muted-foreground">
          {dashboard.profileMissing.length === 0
            ? COMPLETENESS_DONE
            : `${COMPLETENESS_MISSING} ${dashboard.profileMissing.map((field) => PROFILE_FIELD_NAMES[field]).join(', ')}`}
        </p>
        <Link to={PRO_PROFILE_PATH} className={LINK}>
          {EDIT_PROFILE}
        </Link>
      </section>

      <section aria-labelledby={ids.content}>
        <h2 id={ids.content} className="text-h3">
          {CONTENT_HEADING}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label={KPI_ENGAGEMENT} value={String(dashboard.engagement30d)} />
          <Kpi label={KPI_POSTS} value={String(dashboard.posts30d)} />
          <Kpi label={KPI_ARTICLES} value={String(dashboard.articles)} />
        </dl>
        <div className="mt-2 flex flex-wrap gap-4">
          <Link to={PRO_ARTICLES_PATH} className={LINK}>
            {MY_ARTICLES}
          </Link>
          <Link to={professionalPagePath(dashboard.userId)} className={LINK}>
            {VIEW_MY_PAGE}
          </Link>
        </div>
      </section>

      <section aria-labelledby={ids.promotion}>
        <h2 id={ids.promotion} className="text-h3">
          {PROMOTION_HEADING}
        </h2>
        <p className="mt-2 text-muted-foreground">{PROMOTION_NOT_YET}</p>
        <Link to={PRO_PROMOTION_PATH} className={LINK}>
          {PROMOTION_TITLE}
        </Link>
      </section>
    </div>
  );
}
