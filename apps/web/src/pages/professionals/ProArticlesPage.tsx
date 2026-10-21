import { ArticlesScreen } from '@/features/professionals/ArticlesScreen';
import { documentTitle } from '@/lib/document-title';
import { ARTICLES_TITLE } from '@/lib/professional-texts';

// The owner's articles (FR-PRO-003), from the Professional's home and the side menu.
export function ProArticlesPage() {
  return (
    <>
      <title>{documentTitle(ARTICLES_TITLE)}</title>
      <h1 className="text-h2">{ARTICLES_TITLE}</h1>
      <div className="mt-5">
        <ArticlesScreen />
      </div>
    </>
  );
}
