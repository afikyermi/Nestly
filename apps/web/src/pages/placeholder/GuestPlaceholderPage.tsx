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
}

// A screen not built yet that a Guest may open (the two documents, I9): its heading, one line and a way back, to Welcome, or for a
// signed-in user to the Terms & Privacy section of Settings (F2.5 c7). It sends no request anywhere.
export function GuestPlaceholderPage({ title }: GuestPlaceholderPageProps) {
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
        <p className="text-body text-muted-foreground">{PLACEHOLDER_TEXT}</p>
      </AuthLayout>
    </main>
  );
}
