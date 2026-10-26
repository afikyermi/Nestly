import { describe, expect, it } from 'vitest';
import { LISTING_CATEGORIES, LISTING_CATEGORY_LABELS, LISTING_DESCRIPTION_MAX, LISTING_PRICE_MAX, LISTING_PRICE_MIN, listingSchema } from '../src/index.js';

// I12 part B (Afik §10.6; FR-MKT-002, VAL-013): the shared listing rule the web and the server both apply. Expected values are the decision's
// ("מכשירי חשמל"; a description up to 1,000; a price 0 to 100,000, 0 = "למסירה"), not the schema's.
const base = { title: 'מחמם בקבוקים', category: 'electrical', condition: 'good', price: 50, city: 'center' };

describe('[I12-B FR-MKT-002 VAL-013] listingSchema', () => {
  it('[AC-200] the category list holds "מכשירי חשמל", before "אחר"', () => {
    expect(LISTING_CATEGORY_LABELS.electrical).toBe('מכשירי חשמל');
    expect(LISTING_CATEGORIES.indexOf('electrical')).toBe(LISTING_CATEGORIES.indexOf('other') - 1);
    expect(listingSchema.safeParse(base).success).toBe(true);
  });

  it('[AC-204] a price from 0 to 100,000 in whole shekels; 0 is "למסירה" (kept as no price)', () => {
    expect([LISTING_PRICE_MIN, LISTING_PRICE_MAX]).toEqual([0, 100_000]);
    expect(listingSchema.parse({ ...base, price: 0 }).price).toBeNull();
    expect(listingSchema.parse({ ...base, price: 100_000 }).price).toBe(100_000);
    expect(listingSchema.parse({ ...base, price: null }).price).toBeNull();
    for (const price of [-1, 100_001, 1.5, '50']) expect(listingSchema.safeParse({ ...base, price }).success, String(price)).toBe(false);
  });

  it('[AC-201] an optional description of up to 1,000 characters, trimmed; blank is none', () => {
    expect(LISTING_DESCRIPTION_MAX).toBe(1000);
    expect(listingSchema.parse(base).description, 'absent: an edit keeps the stored one').toBeUndefined();
    expect(listingSchema.parse({ ...base, description: '  עובד מצוין  ' }).description).toBe('עובד מצוין');
    expect(listingSchema.parse({ ...base, description: '   ' }).description).toBeNull();
    expect(listingSchema.parse({ ...base, description: 'ש'.repeat(1000) }).description).toHaveLength(1000);
    expect(listingSchema.parse({ ...base, description: '😀'.repeat(1000) }).description, 'code points, not UTF-16 units').not.toBeNull();
    const long = listingSchema.safeParse({ ...base, description: 'ש'.repeat(1001) });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toBe('description_too_long');
  });
});
