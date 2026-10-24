import type { ReactNode } from 'react';
import { useLinkClickHandler } from 'react-router';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { useSession } from '@/hooks/use-session';
import { documentTitle } from '@/lib/document-title';
import { settingsSectionHash } from '@/lib/settings-sections';
import { PLACEHOLDER_TEXT } from './placeholder-text';

export interface GuestPlaceholderPageProps {
  /** The screen's h1, and its document title. */
  title: string;
  children?: ReactNode;
}

// Shared public-document frame: supplied document content, or the remaining Terms placeholder (I9).
// Both guests and signed-in accounts can read it without requests; the back link returns to their entry surface.
export function GuestPlaceholderPage({ title, children }: GuestPlaceholderPageProps) {
  const { state } = useSession();
  const backTo = state === 'signed-in' ? `${PATHS.settings}${settingsSectionHash('terms')}` : PATHS.welcome;
  const toBack = useLinkClickHandler(backTo);
  return (
    <main tabIndex={-1}>
      <title>{documentTitle(title)}</title>
      <AuthLayout
        back={
          <Button iconOnly label={state === 'signed-in' ? 'חזרה להגדרות' : 'חזרה'} href={backTo} onClick={toBack}>
            <ArrowBackIcon />
          </Button>
        }
      >
        <h1 className="mb-2 text-h1">{title}</h1>
        {children ?? <p className="text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p>}
      </AuthLayout>
    </main>
  );
}
