import { Navigate } from 'react-router';
import { HomeScreen } from '@/features/home/HomeScreen';
import { ProfessionalHomeScreen } from '@/features/professionals/ProfessionalHomeScreen';
import { Skeleton } from '@/components/ui/skeleton';
import { PATHS } from '@/app/paths';
import { useAccountKind } from '@/hooks/use-account-kind';
import { documentTitle } from '@/lib/document-title';
import { PRO_HOME_TITLE } from '@/lib/professional-texts';
import { HOME_TEXT } from '@/lib/tracker-texts';

// The home (PG-009, FR-HOME-001..004). A Regular parent's tracking and planning; a Professional gets its business dashboard instead (FR-PRO-001,
// AC-018: no parent tracking on a Professional account); a staff account its own home in the admin area (I14 completion, Afik 21.10.2026: the
// Admin's home, a Moderator's "my work"). The page only composes; the kind is the server's answer (presentation only).
export function HomePage() {
  const kind = useAccountKind();
  if (kind === 'loading') return <Skeleton className="h-64 w-full" />;
  if (kind === 'staff') return <Navigate to={PATHS.admin} replace />;
  if (kind === 'professional') {
    return (
      <>
        <title>{documentTitle(PRO_HOME_TITLE)}</title>
        <h1 className="text-h2">{PRO_HOME_TITLE}</h1>
        <div className="mt-5">
          <ProfessionalHomeScreen />
        </div>
      </>
    );
  }
  return (
    <>
      <title>{documentTitle(HOME_TEXT.title)}</title>
      <h1 className="text-h2">{HOME_TEXT.title}</h1>
      <p className="mt-2 text-body text-muted-foreground">{HOME_TEXT.lead}</p>
      <div className="mt-5">
        <HomeScreen />
      </div>
    </>
  );
}
