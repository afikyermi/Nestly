import { describe, expect, it } from 'vitest';
import type { FeedPageResponse, FeedUnit } from '@nestly/shared';
import { shownPromotions, withPromoted } from '@/features/posts/feed-state';
import { PROMOTED_LISTING_LABEL, SPONSORED_LABEL } from '@/lib/promotion-texts';

const unit = (n: number, source: 'organic' | 'promoted' = 'organic'): FeedUnit => ({
  kind: 'post',
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  source,
  body: `post ${n}`,
  audience: 'everyone',
  stageTag: null,
  createdAt: '2026-10-21T09:00:00.000Z',
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  isMine: false,
  isAnonymous: false,
  author: { name: 'דנה' },
});

describe('[I13 FR-ALG-007 §11.2 AC-062] promoted posts in the feed', () => {
  it('[§11.2] each promoted post sits after its number of organic posts; the organic order is unchanged', () => {
    const organic = Array.from({ length: 10 }, (_, i) => unit(i + 1));
    const page: FeedPageResponse = {
      items: organic,
      nextCursor: null,
      configVersion: 1,
      promoted: [
        { promotionId: '10000000-0000-4000-8000-000000000001', afterIndex: 5, unit: unit(101, 'promoted') },
        { promotionId: '10000000-0000-4000-8000-000000000002', afterIndex: 10, unit: unit(102, 'promoted') },
      ],
    };
    const merged = withPromoted(page);
    expect(merged.map((u) => u.body)).toEqual(['post 1', 'post 2', 'post 3', 'post 4', 'post 5', 'post 101', 'post 6', 'post 7', 'post 8', 'post 9', 'post 10', 'post 102']);
    expect(merged.filter((u) => u.source === 'organic').map((u) => u.id)).toEqual(organic.map((u) => u.id));
  });
  it('[FR-ALG-007] an impression is reported only for a promoted post that joins the list, never for one already shown', () => {
    const page: FeedPageResponse = {
      items: [unit(1), unit(2), unit(3), unit(4)],
      nextCursor: null,
      configVersion: 1,
      promoted: [
        { promotionId: '10000000-0000-4000-8000-000000000001', afterIndex: 2, unit: unit(50, 'promoted') },
        { promotionId: '10000000-0000-4000-8000-000000000002', afterIndex: 4, unit: unit(101, 'promoted') },
      ],
    };
    // post 50 was shown organically on an earlier page: its slot is dropped and its promotion is not counted
    expect(shownPromotions([unit(50)], page)).toEqual(['10000000-0000-4000-8000-000000000002']);
    expect(shownPromotions([], page)).toHaveLength(2);
  });
  it('[§11.5 BR-005] the labels: "ממומן" for a Professional, "מודעה מקודמת" for a listing', () => {
    expect(SPONSORED_LABEL).toBe('ממומן');
    expect(PROMOTED_LISTING_LABEL).toBe('מודעה מקודמת');
  });
});
