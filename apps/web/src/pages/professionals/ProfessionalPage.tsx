import { useParams } from 'react-router';
import { professionalIdParams } from '@nestly/shared';
import { ProfessionalScreen } from '@/features/professionals/ProfessionalScreen';
import { documentTitle } from '@/lib/document-title';
import { DIRECTORY_TITLE, PROFILE_GONE } from '@/lib/professional-texts';

// One Professional's page, `/pros/<id>` (FR-SERV-003). Keyed by the id; the screen names the document once the profile is read.
export function ProfessionalPage() {
  const { professionalId = '' } = useParams();
  const id = professionalIdParams.safeParse({ id: professionalId });
  return (
    <>
      <title>{documentTitle(DIRECTORY_TITLE)}</title>
      {id.success ? <ProfessionalScreen key={id.data.id} professionalId={id.data.id} /> : <p>{PROFILE_GONE}</p>}
    </>
  );
}
