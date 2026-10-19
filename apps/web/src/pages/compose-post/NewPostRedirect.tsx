import { Navigate } from 'react-router';
import { PATHS } from '@/app/paths';
import { requestComposer } from '@/features/posts/compose-draft';

// `/posts/new`, the old composer address (protected; feed-composer c11, D3): old links and bookmarks land on the feed with the composer
// open. History is replaced, so Back never returns here. The request is in memory: a reload shows the composer collapsed.
export function NewPostRedirect() {
  requestComposer();
  return <Navigate to={PATHS.feed} replace />;
}
