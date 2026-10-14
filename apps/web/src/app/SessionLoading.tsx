import { Skeleton } from '@/components/ui/skeleton';
import { documentTitle } from '@/lib/document-title';

// Shown while the session is not known yet (FR-AUTH-004, "before the screen loads"): neither Welcome nor any
// protected screen. A skeleton, not a spinner (direction.md); the status is read by assistive technology.
export function SessionLoading() {
  return (
    <main tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-5 pt-6">
      <title>{documentTitle()}</title>
      <p role="status" className="sr-only">
        בטעינה
      </p>
      <Skeleton className="h-8 w-40" />
      <Skeleton />
      <Skeleton className="w-2/3" />
    </main>
  );
}
