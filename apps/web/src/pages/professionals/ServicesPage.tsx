import { DirectoryScreen } from '@/features/professionals/DirectoryScreen';
import { documentTitle } from '@/lib/document-title';
import { DIRECTORY_INTRO, DIRECTORY_TITLE } from '@/lib/professional-texts';

// The directory of Professionals (FR-SERV-001/002), from the bottom navigation ("יועצים") and the side menu.
export function ServicesPage() {
  return (
    <>
      <title>{documentTitle(DIRECTORY_TITLE)}</title>
      <h1 className="text-h2">{DIRECTORY_TITLE}</h1>
      <p className="mt-2 text-muted-foreground">{DIRECTORY_INTRO}</p>
      <div className="mt-5">
        <DirectoryScreen />
      </div>
    </>
  );
}
