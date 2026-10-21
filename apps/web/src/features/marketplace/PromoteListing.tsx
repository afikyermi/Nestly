import { useState } from 'react';
import type { PromotionItem, PromotionPlan } from '@nestly/shared';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { SelectInput } from '@/components/ui/select-input';
import { useProCall } from '@/hooks/use-pro-call';
import {
  ALREADY_PROMOTED,
  BUY_FAILED,
  CANCEL,
  CONFIRM_BUY,
  LISTING_PROMOTED,
  NOT_ALLOWED,
  PLAN_LABEL,
  PROMOTE_LISTING,
  PROMOTE_LISTING_INTRO,
  PROMOTE_LISTING_TITLE,
  SIMULATED_NOTE,
  STOPPED_BY_STAFF,
  countsText,
  planText,
} from '@/lib/promotion-texts';
import { buyPromotion } from '@/services/api/promotions';

export interface PromoteListingProps {
  listingId: string;
  /** The listing plans (sample prices, "מחיר לדוגמה"). */
  plans: readonly PromotionPlan[];
  /** The caller's promotions of this listing, newest first. */
  promotions: readonly PromotionItem[];
  onPromoted: () => void;
}

// Promote a listing (FR-MKT-004, BR-020, NFR-SEC-007): a Regular's own live listing, a plan and a simulated payment. A running promotion is
// shown instead of the button ("המודעה מקודמת", with its counts); one staff stopped says "הקידום הופסק" (§11.1).
export function PromoteListing({ listingId, plans, promotions, onPromoted }: PromoteListingProps) {
  const call = useProCall();
  const [plan, setPlan] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = promotions.find((item) => item.state === 'running');
  const latest = promotions[0];
  const chosen = plans.find((p) => p.key === plan) ?? plans[0];

  if (running !== undefined)
    return (
      <p className="text-small">
        <span className="text-label">{LISTING_PROMOTED}</span> · {countsText(running.counts.impressions, running.counts.clicks)}
      </p>
    );

  async function buy() {
    if (chosen === undefined) return;
    setBusy(true);
    const result = await call((token) => buyPromotion(token, { planKey: chosen.key, target: { kind: 'listing', listingId } }));
    setBusy(false);
    if (result.kind === 'ok') {
      setOpen(false);
      onPromoted();
    } else setFailure(result.kind === 'already-done' ? ALREADY_PROMOTED : result.kind === 'not-allowed' ? NOT_ALLOWED : BUY_FAILED);
  }

  return (
    <div className="flex flex-col gap-2">
      {latest?.state === 'stopped' && latest.stoppedBy === 'staff' ? <p className="text-small">{STOPPED_BY_STAFF}</p> : null}
      {plans.length > 1 ? (
        <FormField label={PLAN_LABEL}>
          {(control) => (
            <SelectInput
              {...control}
              options={plans.map((p) => ({ value: p.key, label: planText(p.key, p.samplePriceIls) }))}
              placeholder={PLAN_LABEL}
              value={chosen?.key ?? ''}
              onChange={setPlan}
            />
          )}
        </FormField>
      ) : null}
      <Button type="button" variant="soft" className="self-start" disabled={chosen === undefined} onClick={() => { setFailure(null); setOpen(true); }}>
        {PROMOTE_LISTING}
      </Button>
      <ConfirmDialog
        open={open}
        title={PROMOTE_LISTING_TITLE}
        description={
          <span className="flex flex-col gap-3">
            <span>{PROMOTE_LISTING_INTRO}</span>
            <span>{SIMULATED_NOTE}</span>
          </span>
        }
        confirmLabel={CONFIRM_BUY}
        cancelLabel={CANCEL}
        pending={busy}
        failure={failure}
        onConfirm={() => void buy()}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
      />
      {failure !== null && !open ? <InlineAlert>{failure}</InlineAlert> : null}
    </div>
  );
}
