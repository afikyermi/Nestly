import { useCallback, useEffect, useState } from 'react';
import type { HomeResponse } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthedCall } from '@/hooks/use-authed-call';
import { HOME_TEXT, ERROR_TEXT } from '@/lib/tracker-texts';
import { fetchHome } from '@/services/api/trackers';
import { HomeContent } from './HomeContent';

// The home's flow: load GET /api/home once, show it, or fail inline with a retry. A refused token or a stopped account is the session
// guard's to end (useAuthedCall).
export function HomeScreen() {
  const call = useAuthedCall();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const result = await call(fetchHome);
    if (result.kind === 'ok') setHome(result.value);
    else setFailed(true);
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{HOME_TEXT.loadFailed}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void load()}>
          {ERROR_TEXT.retry}
        </Button>
      </div>
    );
  }
  if (home === null) return <Skeleton className="h-64 w-full" />;
  return <HomeContent home={home} hasChild={home.contexts.some((c) => c.kind === 'parenting')} />;
}
