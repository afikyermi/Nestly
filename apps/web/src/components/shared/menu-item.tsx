import type { MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { isPlainClick } from '@/lib/is-plain-click';

interface MenuItemBase {
  /** The label, and the accessible name. */
  children: ReactNode;
  icon?: ReactNode;
  /** Not activatable and announced as disabled; it stays focusable so the screen reader finds it. */
  disabled?: boolean;
  /** The destination already open: marked with aria-current="page" and a heavier label. */
  current?: boolean;
  className?: string;
}

// `href` renders a link, `onClick` a button; the two are mutually exclusive, and one of them is required.
// A link may take `onNavigate`: called with the href on a plain click, in place of the browser following
// it (client-side routing); a modified click (new tab, new window) is still the browser's. A link may also take `target` and `rel` (an
// outside app opened in a new window).
export type MenuItemProps = MenuItemBase &
  (
    | { href: string; onNavigate?: (href: string) => void; target?: string; rel?: string; onClick?: undefined }
    | { href?: undefined; onNavigate?: undefined; target?: undefined; rel?: undefined; onClick: () => void }
  );

const styles = [
  'flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-start text-body text-foreground no-underline',
  'transition-colors duration-fast ease-standard hover:bg-muted',
  'aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary-strong',
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent',
];

export function MenuItem(props: MenuItemProps) {
  const { children, icon, disabled = false, current = false, className } = props;
  const ariaCurrent: 'page' | undefined = current ? 'page' : undefined;
  const common = {
    className: cn(styles, className),
    'aria-disabled': disabled ? true : undefined,
    'aria-current': ariaCurrent,
  };
  const content = (
    <>
      {icon !== undefined ? (
        <span aria-hidden="true" className="shrink-0 text-primary-strong">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">{children}</span>
    </>
  );

  if (props.href !== undefined) {
    const { href, onNavigate, target, rel } = props;
    return (
      <a
        {...common}
        href={href}
        {...(target === undefined ? {} : { target })}
        {...(rel === undefined ? {} : { rel })}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          if (onNavigate === undefined || !isPlainClick(event)) return;
          event.preventDefault();
          onNavigate(href);
        }}
      >
        {content}
      </a>
    );
  }
  const { onClick } = props;
  return (
    <button
      {...common}
      type="button"
      onClick={() => {
        if (!disabled) onClick?.();
      }}
    >
      {content}
    </button>
  );
}
