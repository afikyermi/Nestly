import type { MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface MenuItemBase {
  /** The label, and the accessible name. */
  children: ReactNode;
  icon?: ReactNode;
  /** Not activatable and announced as disabled; it stays focusable so the screen reader finds it. */
  disabled?: boolean;
  className?: string;
}

// `href` renders a link, `onClick` a button; the two are mutually exclusive.
export type MenuItemProps = MenuItemBase &
  ({ href: string; onClick?: undefined } | { href?: undefined; onClick?: () => void });

const styles = [
  'flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-start text-body text-foreground no-underline',
  'transition-colors duration-fast ease-standard hover:bg-muted',
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent',
];

export function MenuItem(props: MenuItemProps) {
  const { children, icon, disabled = false, className } = props;
  const common = { className: cn(styles, className), 'aria-disabled': disabled ? true : undefined };
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
    return (
      <a
        {...common}
        href={props.href}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (disabled) event.preventDefault();
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
