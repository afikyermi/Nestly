// People Search finds Professionals too (FR-SEARCH-001, SRS audit 21.10.2026): a Professional in People carries the "חשבון מקצועי" mark and
// opens its Professional page (/pros/<id>); a Regular user opens the profile (/u/<id>) with no mark.
import { render, screen } from '@testing-library/react';
import type { SearchResponse } from '@nestly/shared';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SearchResults } from '@/features/search/SearchResults';
import { userProfilePath } from '@/lib/profile-link';

const REGULAR = 'a0000000-0000-4000-8000-000000000001';
const PRO = 'a0000000-0000-4000-8000-000000000002';

const data: SearchResponse = {
  people: [
    { userId: REGULAR, fullName: 'דנה כהן', isProfessional: false },
    { userId: PRO, fullName: 'רותם לוי', isProfessional: true },
  ],
  groups: [],
  posts: [],
  peopleLimited: false,
};

describe('[FR-SEARCH-001] People in the search results', () => {
  it('marks a Professional "חשבון מקצועי" and opens its Professional page; a Regular user opens the profile with no mark', () => {
    render(
      <MemoryRouter>
        <SearchResults data={data} type="people" />
      </MemoryRouter>,
    );
    const pro = screen.getByRole('link', { name: 'לעמוד המקצועי של רותם לוי' });
    expect(pro.getAttribute('href')).toBe(`/pros/${PRO}`);
    expect(pro.textContent).toContain('חשבון מקצועי');
    const regular = screen.getByRole('link', { name: 'לפרופיל של דנה כהן' });
    expect(regular.getAttribute('href')).toBe(userProfilePath(REGULAR));
    expect(regular.getAttribute('href')).not.toMatch(/^\/pros\//);
    expect(regular.textContent).not.toContain('חשבון מקצועי');
    expect(screen.getAllByText('חשבון מקצועי')).toHaveLength(1);
  });
});
