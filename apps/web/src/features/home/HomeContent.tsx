import { formatChildAge, GUIDE_DISCLAIMER, TRACKER_KINDS, type HomeResponse, type StageContext } from '@nestly/shared';
import { PATHS } from '@/app/paths';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';
import {
  BathIcon,
  BottleIcon,
  BreastfeedingIcon,
  DiaperIcon,
  GrowthIcon,
  HeartIcon,
  MedicineIcon,
  SleepIcon,
  VaccineIcon,
} from '@/components/ui/icons';
import type { TrackerKind } from '@nestly/shared';
import { trackerPath } from '@/lib/tracker-link';
import { cn } from '@/lib/cn';
import { HOME_TEXT, PAGE_LABEL } from '@/lib/tracker-texts';

export interface HomeContentProps {
  home: HomeResponse;
  /** Whether the parent has a child: the child trackers need one. */
  hasChild: boolean;
}

const dayFormat = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', dateStyle: 'medium' });
const showDay = (iso: string): string => dayFormat.format(new Date(`${iso}T00:00:00Z`));

const card = 'flex flex-col gap-1 rounded-lg bg-card p-4 text-card-foreground shadow-card';
// A journey card (redesign 27.10.2026): pregnancy on the pale plum, a child on warm sand, planning and the cycle on the quiet grey. They sit
// side by side and the row scrolls sideways when they do not fit.
const journeyCard = 'flex min-h-32 w-64 shrink-0 snap-start flex-col justify-between gap-2 rounded-lg p-4 text-foreground';

const TRACKER_ICONS: Record<TrackerKind, ReactNode> = {
  breastfeeding: <BreastfeedingIcon />,
  bottle: <BottleIcon />,
  sleep: <SleepIcon />,
  diaper: <DiaperIcon />,
  medicine: <MedicineIcon />,
  growth: <GrowthIcon />,
  vaccine: <VaccineIcon />,
  bath: <BathIcon />,
};

// The pregnancy week as a ring: the share of 40 weeks in plum and the number in the hole. Decorative: the card says the week in words.
function WeekRing({ week }: { week: number }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="size-16 shrink-0 -rotate-90">
      <circle cx="32" cy="32" r="27" fill="none" strokeWidth={6} className="stroke-primary-soft" />
      <circle cx="32" cy="32" r="27" fill="none" strokeWidth={6} strokeLinecap="round" pathLength={40} strokeDasharray={`${Math.min(week, 40)} 40`} className="stroke-primary" />
      <text x="32" y="32" dominantBaseline="central" textAnchor="middle" transform="rotate(90 32 32)" className="fill-badge-foreground text-h2 font-heavy">
        {week}
      </text>
    </svg>
  );
}

function ContextCard({ context }: { context: StageContext }) {
  if (context.kind === 'planning') {
    return (
      <li className={cn(journeyCard, 'bg-muted')}>
        <p className="text-h3">{HOME_TEXT.planning}</p>
      </li>
    );
  }
  if (context.kind === 'pregnancy') {
    return (
      <li className={cn(journeyCard, 'bg-brand-subtle ring-1 ring-primary-soft ring-inset')}>
        <p className="text-label font-bold text-primary-strong">{HOME_TEXT.pregnancy}</p>
        <div className="flex items-center gap-3">
          {context.week !== null ? <WeekRing week={context.week} /> : null}
          <p className="text-body">
            {context.week !== null && context.trimester !== null ? HOME_TEXT.pregnancyWeek(context.week, context.trimester) : HOME_TEXT.pregnancyNoDate}
          </p>
        </div>
      </li>
    );
  }
  const years = Math.floor(context.ageMonths / 12);
  return (
    <li className={cn(journeyCard, 'bg-warm')}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-card text-h2 font-heavy text-warm-foreground">
          {[...context.childName][0]}
        </span>
        <p className="text-h3">{context.childName}</p>
      </div>
      <p className="text-body text-warm-foreground">{HOME_TEXT.childAge(formatChildAge(years, context.ageMonths % 12))}</p>
    </li>
  );
}

// The home by journey stage (PG-009; FR-HOME-001..004, AC-006): a card for every route the parent follows, the add-route entry, the
// tracker grid and the published guides that match the stage. Display only: loading and failing are the screen's.
export function HomeContent({ home, hasChild }: HomeContentProps) {
  const cycle = home.cycle;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="home-routes" className="flex flex-col gap-3">
        <h2 id="home-routes" className="text-h3">{HOME_TEXT.routesTitle}</h2>
        {home.contexts.length === 0 && cycle === null ? (
          <p className="rounded-lg bg-muted p-4 text-body text-muted-foreground">{HOME_TEXT.noRoutes}</p>
        ) : (
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            {home.contexts.map((context, index) => (
              <ContextCard key={`${context.kind}${index}`} context={context} />
            ))}
            {cycle !== null ? (
              <li className={cn(journeyCard, 'bg-muted')}>
                <p className="text-label font-bold">{HOME_TEXT.cycleCard}</p>
                <p className="text-body">
                  {HOME_TEXT.cycleWindow}: {showDay(cycle.windowStart)} – {showDay(cycle.windowEnd)}
                </p>
                <p className="text-small text-muted-foreground">{HOME_TEXT.cycleEstimate}</p>
              </li>
            ) : null}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label">{HOME_TEXT.addRouteTitle}</span>
          <Button href={PATHS.profile} variant="soft">
            {HOME_TEXT.addChildOrPregnancy}
          </Button>
          <Button href={trackerPath('cycle')} variant="soft">
            {HOME_TEXT.addCycle}
          </Button>
        </div>
      </section>

      <section aria-labelledby="home-trackers" className="flex flex-col gap-3">
        <h2 id="home-trackers" className="text-h3">{HOME_TEXT.trackersTitle}</h2>
        {hasChild ? null : <p className="text-body text-muted-foreground">{HOME_TEXT.trackersNeedChild}</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRACKER_KINDS.map((kind) => (
            <li key={kind}>
              <a
                href={trackerPath(kind)}
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg bg-muted p-3 text-center text-label text-foreground no-underline transition-colors duration-fast ease-standard hover:bg-accent"
              >
                <span aria-hidden="true" className="text-primary-strong">
                  {TRACKER_ICONS[kind]}
                </span>
                {PAGE_LABEL[kind]}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="home-guides" className="flex flex-col gap-3">
        <h2 id="home-guides" className="text-h3">{HOME_TEXT.guidesTitle}</h2>
        {home.guides.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-body text-muted-foreground">{HOME_TEXT.guidesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {home.guides.map((guide) => (
              <li key={guide.id} className={card}>
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-label">
                    <HeartIcon className="size-5 shrink-0 text-primary-strong" aria-hidden="true" />
                    {guide.title}
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-body">{guide.body}</p>
                  <p className="mt-2 text-small text-muted-foreground">{`${HOME_TEXT.guideSource}: ${guide.source}`}</p>
                  <p className="mt-1 text-small text-muted-foreground">{GUIDE_DISCLAIMER}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
