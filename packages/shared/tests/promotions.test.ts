import { describe, expect, it } from 'vitest';
import { feedPromotionGap, promotionSettingsWriteSchema, promotionStopSchema } from '../src/validation/promotions.js';

const v1 = { feedGapMin: 4, feedGapMax: 7, feedLowPosts: 20, feedHighPosts: 200 };

describe('[I13 §11.2 FR-ALG-007] the feed interleave gap', () => {
  it('[§11.2] few posts in the last 48 hours: 4 organic posts between promoted ones; many: 7; gradual between', () => {
    expect(feedPromotionGap(v1, 0)).toBe(4);
    expect(feedPromotionGap(v1, 20)).toBe(4);
    expect(feedPromotionGap(v1, 110)).toBe(6);
    expect(feedPromotionGap(v1, 200)).toBe(7);
    expect(feedPromotionGap(v1, 5000)).toBe(7);
    const steps = [20, 50, 80, 110, 140, 170, 200].map((n) => feedPromotionGap(v1, n));
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
});

describe('[I13 §11.1 §11.2] staff input', () => {
  it('[§11.1 FR-ADMIN-005] a staff stop needs a reason of 1 to 500 characters', () => {
    expect(promotionStopSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(promotionStopSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
    expect(promotionStopSchema.safeParse({ reason: 'טענות מטעות' }).success).toBe(true);
  });
  it('[§11.2 BR-059] the settings: the larger gap is at least the smaller; the "many" threshold above the "few"', () => {
    const base = { dailyCap: 3, directoryUnitsPerPage: 1, ...v1, reason: 'x' };
    expect(promotionSettingsWriteSchema.safeParse(base).success).toBe(true);
    expect(promotionSettingsWriteSchema.safeParse({ ...base, feedGapMax: 3 }).success).toBe(false);
    expect(promotionSettingsWriteSchema.safeParse({ ...base, feedHighPosts: 20 }).success).toBe(false);
    expect(promotionSettingsWriteSchema.safeParse({ ...base, dailyCap: 0 }).success).toBe(false);
    expect(promotionSettingsWriteSchema.safeParse({ ...base, reason: '' }).success).toBe(false);
  });
});
