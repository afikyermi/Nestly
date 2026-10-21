import { useCallback, useEffect, useState } from 'react';
import type { BillingItem } from '@nestly/shared';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProCall } from '@/hooks/use-pro-call';
import { formatPostTime } from '@/lib/format-post-time';
import {
  BILLING_INTRO,
  BILLING_SCREEN_TITLE,
  LOAD_FAILED,
  NO_PAYMENTS,
  PLAN_LABELS,
  REFERENCE_LABEL,
  RETRY,
  SAMPLE_PRICE,
  SIMULATED_BADGE,
  TARGET_KIND_LABELS,
  shekels,
} from '@/lib/promotion-texts';
import { fetchBilling } from '@/services/api/promotions';

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'loaded'; payments: BillingItem[] };

// Billing (PG-042; FR-SERV-010, NFR-SEC-007, AC-098): the caller's simulated payments for promotions — the plan, the sample amount, when, and
// the simulated reference. No card or address is ever asked or shown.
export function BillingScreen() {
  const call = useProCall();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const refresh = useCallback(async () => {
    const result = await call((token) => fetchBilling(token));
    setLoad(result.kind === 'ok' ? { kind: 'loaded', payments: result.value } : { kind: 'failed' });
  }, [call]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (load.kind === 'loading') return <Skeleton className="h-32" />;
  if (load.kind === 'failed')
    return (
      <div className="flex flex-col gap-3">
        <InlineAlert>{LOAD_FAILED}</InlineAlert>
        <Button type="button" variant="soft" className="self-start" onClick={() => void refresh()}>
          {RETRY}
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      <p>{BILLING_INTRO}</p>
      {load.payments.length === 0 ? <p className="text-muted-foreground">{NO_PAYMENTS}</p> : null}
      <ul aria-label={BILLING_SCREEN_TITLE} className="flex flex-col gap-3">
        {load.payments.map((payment) => (
          <li key={payment.id} className="rounded-lg bg-card p-4 shadow-card">
            <p className="text-label">
              {TARGET_KIND_LABELS[payment.targetKind]} · {PLAN_LABELS[payment.planKey]}
            </p>
            <p className="mt-1">
              {shekels(payment.amountIls)} <span className="text-small text-muted-foreground">({SAMPLE_PRICE} · {SIMULATED_BADGE})</span>
            </p>
            <p className="mt-1 text-small text-muted-foreground">
              <time dateTime={payment.at}>{formatPostTime(payment.at)}</time> · {REFERENCE_LABEL}: <span dir="ltr">{payment.reference.slice(0, 8)}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
