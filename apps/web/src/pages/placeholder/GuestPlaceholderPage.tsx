import { useLinkClickHandler } from 'react-router';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { ArrowBackIcon } from '@/components/ui/icons';
import { documentTitle } from '@/lib/document-title';
import { PLACEHOLDER_TEXT } from './placeholder-text';

export interface GuestPlaceholderPageProps {
  /** The screen's h1, and its document title. */
  title: string;
}

// A Guest screen not built yet (Login F1.5, Registration F1.3, the Google entry F1.8): its heading, one line
// and a way back to Welcome. It sends no request anywhere.
export function GuestPlaceholderPage({ title }: GuestPlaceholderPageProps) {
  const toWelcome = useLinkClickHandler(PATHS.welcome);
  return (
    <main tabIndex={-1}>
      <title>{documentTitle(title)}</title>
      <AuthLayout
        back={
          <Button iconOnly label="חזרה" href={PATHS.welcome} onClick={toWelcome}>
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
