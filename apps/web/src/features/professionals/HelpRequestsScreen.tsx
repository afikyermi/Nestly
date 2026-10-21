import { useCallback, useEffect, useState } from 'react';
import type { HelpRequestItem, ProfessionalDashboard } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProCall } from '@/hooks/use-pro-call';
import { HELP_INTRO, LOAD_FAILED, NOT_A_PROFESSIONAL, RETRY, offersLeftText } from '@/lib/professional-texts';
import { fetchProfessionalHome } from '@/services/api/professionals';
import { HelpRequestsList } from './HelpRequestsList';

type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'not-professional' }
  | { kind: 'loaded'; dashboard: ProfessionalDashboard; help: HelpRequestItem[] };

// The posts that ask for help (FR-SERV-005), a Professional's bottom navigation item (Afik 21.10.2026, §9.8): today's "X/10" and every request the
// feed's rules let it read, each with "הצעת עזרה" once. The server answers a non-Professional with a refusal; the page then says so.
export function HelpRequestsScreen() {
  const call = useProCall();
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  const load = useCallback(async () => {
    const result = await call(fetchProfessionalHome);
    if (result.kind === 'ok') setLoaded({ kind: 'loaded', dashboard: result.value.dashboard, help: result.value.helpRequests });
    else setLoaded(result.kind === 'not-allowed' ? { kind: 'not-professional' } : { kind: 'failed' });
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loaded.kind === 'loading') return <Skeleton className="h-64 w-full" />;
  if (loaded.kind === 'not-professional') return <p className="text-muted-foreground">{NOT_A_PROFESSIONAL}</p>;
  if (loaded.kind === 'failed') {
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{LOAD_FAILED}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void load()}>
          {RETRY}
        </Button>
      </div>
    );
  }
  return (
    <div>
      <p className="text-label">{offersLeftText(loaded.dashboard.offersToday, loaded.dashboard.offersPerDay)}</p>
      <p className="mt-1 text-small text-muted-foreground">{HELP_INTRO}</p>
      <HelpRequestsList items={loaded.help} onSent={load} />
    </div>
  );
}
