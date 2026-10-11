// UI wave 1 part b: criterion 23 (Skeleton), the unit half. The reduced-motion half is in e2e/.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from '@/components/ui/skeleton';

describe('Skeleton', () => {
  it('[23] is aria-hidden="true"', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('[23] exposes nothing to assistive technology', () => {
    render(<Skeleton className="h-4 w-64" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('[23] stays hidden when a className is passed', () => {
    const { container } = render(<Skeleton className="h-4 w-64" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
