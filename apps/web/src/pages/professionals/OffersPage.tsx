import { OffersScreen } from '@/features/professionals/OffersScreen';
import { documentTitle } from '@/lib/document-title';
import { OFFERS_TITLE } from '@/lib/professional-texts';

// Offer Help (FR-SERV-005/006): the offers on the caller's posts that asked for help, and a Professional's sent offers. From the side menu.
export function OffersPage() {
  return (
    <>
      <title>{documentTitle(OFFERS_TITLE)}</title>
      <h1 className="text-h2">{OFFERS_TITLE}</h1>
      <div className="mt-5">
        <OffersScreen />
      </div>
    </>
  );
}
