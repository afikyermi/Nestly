import { useLinkClickHandler } from 'react-router';
import { PATHS } from '@/app/paths';
import { AuthLayout } from '@/components/layout/auth-layout';
import { WelcomeIllustration } from '@/components/shared/illustrations';
import { Logo } from '@/components/shared/logo';
import { GoogleButton } from '@/components/shared/google-button';
import { Button } from '@/components/ui/button';
import { useGoogleSignIn } from '@/hooks/use-google-sign-in';
import { documentTitle } from '@/lib/document-title';
import { LegalLinks } from '@/pages/legal/LegalLinks';

/** The brand line (Afik 27.10.2026, OP-022). */
const BRAND_LINE = 'קהילה שמחזיקה אתכם, בכל שלב.';

// Welcome (PG-001, FR-AUTH-001): what a Guest sees on opening the site, with the logo and the brand line (OP-022). One primary action. The Google
// action is a text button, without the provider's logo (FR-AUTH-005, F1.8). Under the actions, the public documents (BR-078, PG-061).
export function WelcomePage() {
  const toRegister = useLinkClickHandler(PATHS.register);
  const google = useGoogleSignIn();
  const toLogin = useLinkClickHandler(PATHS.login);
  return (
    <main tabIndex={-1}>
      <title>{documentTitle()}</title>
      <AuthLayout
        actions={
          <>
            <Button size="lg" block href={PATHS.register} onClick={toRegister}>
              יצירת חשבון חדש
            </Button>
            <GoogleButton busy={google.busy} message={google.message} onPress={google.onPress} buttonRef={google.buttonRef} />
            <Button variant="soft" size="lg" block href={PATHS.login} onClick={toLogin}>
              כבר יש לי חשבון
            </Button>
            <LegalLinks className="mt-2" />
          </>
        }
      >
        <div className="flex flex-1 flex-col items-center text-center">
          <div className="mt-6">
            <Logo size="big" />
          </div>
          <p className="mt-2 text-label text-primary-strong">{BRAND_LINE}</p>
          <div className="mt-7">
            <WelcomeIllustration />
          </div>
          <h1 className="mt-3 text-h1">הצטרפות ל-Nestly</h1>
          <p className="mt-2 max-w-72 text-lead text-muted-foreground">קהילה חמה להורים ולהורים לעתיד, במקום אחד.</p>
        </div>
      </AuthLayout>
    </main>
  );
}
