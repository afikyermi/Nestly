import { ProfileEditScreen } from '@/features/professionals/ProfileEditScreen';
import { documentTitle } from '@/lib/document-title';
import { PROFILE_EDIT_TITLE } from '@/lib/professional-texts';

// The owner's edit of its Professional profile, from the Professional's home and the side menu.
export function ProProfilePage() {
  return (
    <>
      <title>{documentTitle(PROFILE_EDIT_TITLE)}</title>
      <h1 className="text-h2">{PROFILE_EDIT_TITLE}</h1>
      <div className="mt-5">
        <ProfileEditScreen />
      </div>
    </>
  );
}
