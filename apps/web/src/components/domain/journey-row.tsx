import type { MouseEvent } from 'react';
import { formatChildAge, type StageContext } from '@nestly/shared';
import { cn } from '@/lib/cn';
import { isPlainClick } from '@/lib/is-plain-click';
import { LockIcon } from '../ui/icons';

const PRIVATE_NOTE = 'רק אתם רואים';
const ROW_LABEL = 'המסע שלי';

/** The words of one chip: the pregnancy week, a child's name and age, or planning. */
export function journeyChipText(context: StageContext): string {
  if (context.kind === 'planning') return 'מתכננים';
  if (context.kind === 'pregnancy') return context.week === null ? 'הריון' : `שבוע ${context.week} · הריון`;
  const years = Math.floor(context.ageMonths / 12);
  return `${context.childName} · ${formatChildAge(years, context.ageMonths % 12)}`;
}

// The pregnancy week as a ring: the share of 40 weeks drawn in plum, the number in the hole. Decorative: the chip's words say the week.
function WeekRing({ week }: { week: number }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="size-8 shrink-0 -rotate-90">
      <circle cx="16" cy="16" r="13" fill="none" strokeWidth={3} className="stroke-primary-soft" />
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        pathLength={40}
        strokeDasharray={`${Math.min(week, 40)} 40`}
        className="stroke-primary"
      />
      <text x="16" y="16" dominantBaseline="central" textAnchor="middle" className="fill-primary-strong text-caption font-heavy" transform="rotate(90 16 16)">
        {week}
      </text>
    </svg>
  );
}

export interface JourneyRowProps {
  contexts: readonly StageContext[];
  /** Where a chip leads (the home). */
  href: string;
  onNavigate: (href: string) => void;
  /** Placement only. */
  className?: string;
}

// The journey row at the top of the feed (FR-FEED-001, AC-209; redesign 27.10.2026): one chip per active journey, each opening the home,
// and a lock with "רק אתם רואים" (only the account owner ever sees it). Nothing when there is no journey. A row that scrolls sideways when
// it overflows, on purpose, as a hint that there is more.
export function JourneyRow({ contexts, href, onNavigate, className }: JourneyRowProps) {
  if (contexts.length === 0) return null;
  return (
    <nav aria-label={ROW_LABEL} className={cn('-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2', className)}>
      <ul className="m-0 flex shrink-0 list-none gap-2 p-0">
        {contexts.map((context, index) => (
          <li key={`${context.kind}${index}`} className="shrink-0">
            <a
              href={href}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                onNavigate(href);
              }}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full py-1 ps-1 pe-3.5 text-label font-bold text-foreground no-underline',
                context.kind === 'parenting' ? 'bg-warm' : 'bg-muted',
              )}
            >
              {context.kind === 'pregnancy' && context.week !== null ? (
                <WeekRing week={context.week} />
              ) : (
                <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-card text-label font-heavy text-primary-strong">
                  {context.kind === 'parenting' ? [...context.childName][0] : '·'}
                </span>
              )}
              {journeyChipText(context)}
            </a>
          </li>
        ))}
      </ul>
      <span className="inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
        <LockIcon className="size-3.5" />
        {PRIVATE_NOTE}
      </span>
    </nav>
  );
}

const HOME_LINK = 'לבית';

// "המסע שלי" in the desktop end column (redesign 27.10.2026): the same chips stacked, the lock with "רק אתם רואים", and a link to the home.
export function JourneyCard({ contexts, href, onNavigate }: Omit<JourneyRowProps, 'className'>) {
  if (contexts.length === 0) return null;
  const go = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    onNavigate(href);
  };
  return (
    <section aria-labelledby="side-journey" className="flex flex-col gap-3 rounded-lg bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="side-journey" className="text-label font-bold">
          {ROW_LABEL}
        </h2>
        <a href={href} onClick={go} className="inline-flex min-h-11 items-center text-caption text-primary-strong underline underline-offset-4">
          {HOME_LINK}
        </a>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {contexts.map((context, index) => (
          <li
            key={`${context.kind}${index}`}
            className={cn('flex min-h-11 items-center gap-2 rounded-full py-1 ps-1 pe-3.5 text-label font-bold', context.kind === 'parenting' ? 'bg-warm' : 'bg-muted')}
          >
            {context.kind === 'pregnancy' && context.week !== null ? (
              <WeekRing week={context.week} />
            ) : (
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-card text-label font-heavy text-primary-strong">
                {context.kind === 'parenting' ? [...context.childName][0] : '·'}
              </span>
            )}
            {journeyChipText(context)}
          </li>
        ))}
      </ul>
      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
        <LockIcon className="size-3.5" />
        {PRIVATE_NOTE}
      </span>
    </section>
  );
}
