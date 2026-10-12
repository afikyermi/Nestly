import type { ReactNode } from 'react';

export interface AuthLayoutProps {
  /** The form body. */
  children: ReactNode;
  /** The back button, at the inline start above the body. */
  back?: ReactNode;
  /** The bottom actions, pushed to the bottom edge when the body is short. */
  actions?: ReactNode;
}

// The pre-login screen frame (Welcome, Login, registration steps): one centred column.
// No landmark of its own: the page supplies `main`. The column never exceeds the viewport
// (min-w-0, no fixed widths), so the actions stay reachable at 375 without a horizontal scroll.
export function AuthLayout({ children, back, actions }: AuthLayoutProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-3 pb-6">
      {back !== undefined ? <div className="-ms-2 mb-2 flex items-center">{back}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {actions !== undefined ? <div className="mt-auto flex min-w-0 flex-col gap-2.5 pt-4">{actions}</div> : null}
    </div>
  );
}
