import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { LoaderIcon } from './icons';
import { Tooltip } from './tooltip';

const buttonStyles = cva(
  [
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-label font-bold no-underline',
    'transition-colors duration-fast ease-standard',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'rounded-md bg-primary px-5 text-primary-foreground hover:bg-primary-strong',
        // Secondary is neutral (plum marks the primary action only): a light grey with dark text.
        soft: 'rounded-md bg-secondary px-5 text-secondary-foreground hover:bg-accent',
        text: 'rounded-sm px-1 py-2.5 text-primary-strong underline underline-offset-4',
      },
      size: {
        default: '',
        lg: 'min-h-13 rounded-lg text-body font-bold',
      },
      block: { true: 'w-full', false: '' },
      iconOnly: {
        // A quiet icon button: the surface appears on hover only (tokens.md, hover).
        true: 'size-11 rounded-full bg-transparent p-0 text-foreground no-underline hover:bg-muted',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default', block: false, iconOnly: false },
  },
);

type Variant = 'primary' | 'soft' | 'text';

interface ButtonBase {
  size?: 'default' | 'lg';
  block?: boolean;
  /**
   * Work in progress: the label stays, a loader shows (an icon-only button shows the loader
   * instead of its icon), activation does nothing. The button is not disabled, so focus and
   * the screen reader's place are kept (direction.md, states).
   *
   * Contract for the caller: set `pending` synchronously in the handler, or guard on its own
   * state. The guard only holds from the render that carries `pending`; a second activation
   * before that render still reaches the handler. The caller also announces the state in its
   * own live region ("שולח"): `aria-busy` on a button is poorly announced.
   */
  pending?: boolean;
}

// An icon-only button must carry its accessible name: leaving `label` out fails tsc.
// The same text is the tooltip, shown on hover and on focus (NFR-USAB-004).
type ButtonContent =
  | { iconOnly: true; label: string; children: ReactNode; variant?: undefined }
  | { iconOnly?: false; label?: undefined; children?: ReactNode; variant?: Variant };

type NativeProps = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & { href?: undefined };
type LinkProps = Omit<ComponentProps<'a'>, 'children' | 'aria-label'> & { href: string };

export type ButtonProps = ButtonBase & ButtonContent & (NativeProps | LinkProps);

export function Button(props: ButtonProps) {
  const { variant, size, block, pending = false, iconOnly = false, label, children, className, ...rest } = props;
  const classes = cn(buttonStyles({ variant, size, block, iconOnly }), className);
  const content = (
    <>
      {pending ? <LoaderIcon className="size-5 motion-safe:animate-spin" /> : null}
      {pending && iconOnly ? null : children}
    </>
  );
  const common = {
    className: classes,
    'aria-label': label,
    'aria-busy': pending ? true : undefined,
  };

  const element = rest.href !== undefined ? (
    <a
      {...rest}
      {...common}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (pending || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true') {
          event.preventDefault();
          return;
        }
        rest.onClick?.(event);
      }}
    >
      {content}
    </a>
  ) : (
    <button
      {...rest}
      {...common}
      type={rest.type ?? 'button'}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        rest.onClick?.(event);
      }}
    >
      {content}
    </button>
  );

  return iconOnly && label !== undefined ? <Tooltip label={label}>{element}</Tooltip> : element;
}
