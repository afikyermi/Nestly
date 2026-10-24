// I11 completion C (§11.22; FR-SERV-003, BR-072, AC-173): the profile's rating, one decimal above five stars filled in quarters.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RatingLine, StarRating } from '@/components/domain/star-rating';
import { starFills } from '@/lib/rating';
import { ratingText, ratingValueText } from '@/lib/professional-texts';

describe('[AC-173] the rating in quarters', () => {
  it('[AC-173] rounds the average to the nearest quarter, star by star', () => {
    expect(starFills(4.3)).toEqual([1, 1, 1, 1, 0.25]);
    expect(starFills(4.4)).toEqual([1, 1, 1, 1, 0.5]);
    expect(starFills(3.7)).toEqual([1, 1, 1, 0.75, 0]);
    expect(starFills(4.9)).toEqual([1, 1, 1, 1, 1]);
    expect(starFills(1)).toEqual([1, 0, 0, 0, 0]);
    expect(starFills(0)).toEqual([0, 0, 0, 0, 0]);
    expect(starFills(7)).toEqual([1, 1, 1, 1, 1]);
  });

  it('[AC-173 NFR-A11Y-001] one decimal, and a name that says the number, not the stars', () => {
    expect(ratingValueText(4)).toBe('4.0');
    expect(ratingValueText(4.3)).toBe('4.3');
    expect(ratingText(4.3, 3)).toBe('דירוג 4.3 מתוך 5 · 3 ביקורות');
    expect(ratingText(5, 1)).toBe('דירוג 5.0 מתוך 5 · ביקורת אחת');
    render(<StarRating rating={4.3} label={ratingText(4.3, 3)} />);
    expect(screen.getByRole('img', { name: 'דירוג 4.3 מתוך 5 · 3 ביקורות' })).toBeInTheDocument();
  });

  it('[AC-173] a card with no reviews says so', () => {
    render(<RatingLine rating={null} count={0} />);
    expect(screen.getByText('עוד אין ביקורות')).toBeInTheDocument();
  });
});
