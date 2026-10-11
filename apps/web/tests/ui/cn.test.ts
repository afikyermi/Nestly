// UI wave 1 part b: class merging (CRITIC finding 1). A spacing-token override wins.
import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/cn';

describe('cn', () => {
  it('a later spacing-token padding overrides an earlier one', () => {
    expect(cn('p-card-padding p-4')).toBe('p-4');
  });
  it('a later token padding overrides an earlier numeric one', () => {
    expect(cn('px-5 px-screen-margin')).toBe('px-screen-margin');
  });
  it('classes that do not conflict are both kept', () => {
    expect(cn('text-label text-primary')).toBe('text-label text-primary');
  });
});
