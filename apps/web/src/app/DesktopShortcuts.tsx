import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { isPlainClick } from '@/lib/is-plain-click';
import { BagIcon, HomeIcon, MessageIcon, SparkIcon, UserCheckIcon, UserIcon, UsersIcon } from '@/components/ui/icons';
import { MARKETPLACE_NAV_LABEL } from '@/lib/marketplace-texts';
import { FOLLOWING_TITLE, HELP_REQUESTS_TITLE, MY_OFFERS, OFFERS_TITLE } from '@/lib/professional-texts';
import { ADMIN_MENU_LABEL, STAFF_GROUPS_MENU_LABEL } from '@/features/admin/admin-texts';
import { PATHS } from './paths';

interface Shortcut {
  href: string;
  label: string;
  icon: ReactNode;
}

const SHORTCUTS_LABEL = 'קיצורי דרך';

// What each kind of account reaches from the column: only places it already has in its menu or navigation (NFR-USE-001), none new.
function shortcutsOf(kind: 'regular' | 'professional' | 'staff'): Shortcut[] {
  if (kind === 'staff') {
    return [
      { href: PATHS.admin, label: ADMIN_MENU_LABEL, icon: <HomeIcon className="size-5" /> },
      { href: PATHS.groups, label: STAFF_GROUPS_MENU_LABEL, icon: <UsersIcon className="size-5" /> },
    ];
  }
  if (kind === 'professional') {
    return [
      { href: PATHS.home, label: 'הבית שלי', icon: <HomeIcon className="size-5" /> },
      { href: PATHS.groups, label: 'הקבוצות שלי', icon: <UsersIcon className="size-5" /> },
      { href: PATHS.helpRequests, label: HELP_REQUESTS_TITLE, icon: <MessageIcon className="size-5" /> },
      { href: PATHS.offers, label: MY_OFFERS, icon: <SparkIcon className="size-5" /> },
      { href: PATHS.following, label: FOLLOWING_TITLE, icon: <UserCheckIcon className="size-5" /> },
      { href: PATHS.marketplace, label: MARKETPLACE_NAV_LABEL, icon: <BagIcon className="size-5" /> },
    ];
  }
  return [
    { href: PATHS.home, label: 'הבית שלי', icon: <HomeIcon className="size-5" /> },
    { href: PATHS.groups, label: 'הקבוצות שלי', icon: <UsersIcon className="size-5" /> },
    { href: PATHS.friends, label: 'חברים', icon: <UserIcon className="size-5" /> },
    { href: PATHS.following, label: FOLLOWING_TITLE, icon: <UserCheckIcon className="size-5" /> },
    { href: PATHS.offers, label: OFFERS_TITLE, icon: <SparkIcon className="size-5" /> },
    { href: PATHS.marketplace, label: MARKETPLACE_NAV_LABEL, icon: <BagIcon className="size-5" /> },
  ];
}

export interface DesktopShortcutsProps {
  kind: 'regular' | 'professional' | 'staff';
  /** The normalized path open now: its shortcut is marked current. */
  current: string;
  onNavigate: (href: string) => void;
}

// The shortcuts column at the inline-start edge from 1024 (redesign 27.10.2026): quiet rows, an icon in a grey circle and the place's name.
export function DesktopShortcuts({ kind, current, onNavigate }: DesktopShortcutsProps) {
  return (
    <nav aria-label={SHORTCUTS_LABEL}>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {shortcutsOf(kind).map((item) => {
          const here = current === item.href || current.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={here ? 'page' : undefined}
                onClick={(event) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  onNavigate(item.href);
                }}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-md px-2 py-1 text-label no-underline transition-colors duration-fast ease-standard hover:bg-muted',
                  here ? 'font-bold text-primary-strong' : 'text-foreground',
                )}
              >
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-primary-strong">
                  {item.icon}
                </span>
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
